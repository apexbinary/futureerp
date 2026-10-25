"""
AP bill posting — mirror of AR, but with INPUT tax and a credit to Trade Payables.

post_bill():
    Dr  expense/asset (per line base)
    Dr  input tax (component.input_account) per component
        Cr  Trade Payables (recon)  grand total
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from django.db import models, transaction

from erp_server.finance.models import CompanyCode, GLAccount, JournalEntry, JournalEntryLine
from erp_server.finance.service import get_exchange_rate, post_journal_entry, reverse_journal_entry
from erp_server.tax.service import compute_tax, determine_region

from .models import DebitNote, DebitNoteLineTax, VendorBill, VendorBillLineTax


class BillError(Exception):
    pass


DEFAULT_PAYABLE = "200000"   # Trade Payables
DEFAULT_EXPENSE = "500000"   # Cost of Goods Sold (fallback)


def _d2(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"))


def _acct(tenant, coa, number):
    return GLAccount.objects.filter(tenant=tenant, chart_of_accounts=coa, account_number=number).first()


def _next_bill_number(tenant, company_code) -> str:
    last = (
        VendorBill.objects.filter(tenant=tenant, company_code=company_code)
        .exclude(bill_number="")
        .aggregate(mx=models.Max("bill_number"))
    )["mx"]
    seq = (int(last.split("-")[-1]) + 1) if last else 1
    return f"BILL-{seq:05d}"


def _input_account_for(component_id):
    from erp_server.tax.models import TaxComponent
    comp = TaxComponent.objects.select_related("input_account").filter(pk=component_id).first()
    return comp.input_account if comp else None


@transaction.atomic
def post_bill(bill: VendorBill) -> VendorBill:
    bill = VendorBill.objects.select_for_update().get(pk=bill.pk)
    if bill.status != VendorBill.Status.DRAFT:
        raise BillError(f"Only draft bills can be posted (is '{bill.status}').")

    lines = list(bill.lines.select_related("expense_account", "tax_slab").all())
    if not lines:
        raise BillError("Bill has no lines.")

    tenant = bill.tenant
    cc: CompanyCode = bill.company_code
    coa = cc.chart_of_accounts
    region = determine_region(cc.state, bill.vendor.state)

    expense_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    tax_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    payable_total = Decimal("0.00")

    payable_acct = bill.vendor.payable_account or _acct(tenant, coa, DEFAULT_PAYABLE)
    default_expense = _acct(tenant, coa, DEFAULT_EXPENSE)
    if not payable_acct:
        raise BillError("No Trade Payables account configured.")

    if not bill.bill_number:
        bill.bill_number = _next_bill_number(tenant, cc)

    VendorBillLineTax.objects.filter(line__bill=bill).delete()

    for ln in lines:
        base = ln.amount
        exp_acct = ln.expense_account or default_expense
        if not exp_acct:
            raise BillError("No expense account for a line.")
        expense_by_acct[str(exp_acct.id)] += base
        payable_total += base

        slab = ln.tax_slab
        if slab:
            for tl in compute_tax(slab, region, base):
                VendorBillLineTax.objects.create(
                    tenant=tenant, line=ln, component_id=tl.component_id,
                    percentage=tl.percentage, amount=tl.amount,
                )
                acct = _input_account_for(tl.component_id)
                if not acct:
                    raise BillError(f"Tax component {tl.component_code} has no input G/L account.")
                tax_by_acct[str(acct.id)] += tl.amount
                payable_total += tl.amount

    # Convert each debit bucket first, then derive the payable credit as their sum —
    # never convert it independently, or per-line rounding could leave the document
    # a paisa out of balance.
    fx_rate = get_exchange_rate(tenant, bill.currency, cc.currency, bill.bill_date)
    to_base = (lambda amt: _d2(amt * fx_rate)) if fx_rate != 1 else _d2
    expense_by_acct_base = {k: to_base(v) for k, v in expense_by_acct.items()}
    tax_by_acct_base = {k: to_base(v) for k, v in tax_by_acct.items()}
    payable_total_base = sum(expense_by_acct_base.values(), Decimal("0.00")) + sum(tax_by_acct_base.values(), Decimal("0.00"))

    je = JournalEntry.objects.create(
        tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.VENDOR_INVOICE,
        posting_date=bill.bill_date, document_date=bill.bill_date, currency=cc.currency, exchange_rate=fx_rate,
        header_text=f"Vendor bill · {bill.vendor.name}",
        source_type=JournalEntry.SourceType.AP_BILL,
        source_id=bill.id, source_number=bill.bill_number,
        party_type=JournalEntry.PartyType.VENDOR,
        party_code=bill.vendor.code, party_name=bill.vendor.name,
    )
    n = 0
    for acct_id, amt in expense_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.DEBIT, amount=amt, line_text="Expense",
        )
    for acct_id, amt in tax_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.DEBIT, amount=amt, line_text="Input tax",
        )
    n += 1
    JournalEntryLine.objects.create(
        tenant=tenant, journal_entry=je, line_number=n, gl_account=payable_acct,
        debit_credit=JournalEntryLine.DC.CREDIT, amount=payable_total_base,
        posting_key="31",  # SAP: vendor invoice (credit)
        assignment=bill.vendor.code,
        line_text=f"Payable · {bill.vendor.name}",
    )

    je = post_journal_entry(je)

    bill.journal_entry = je
    bill.status = VendorBill.Status.POSTED
    bill.posted_at = datetime.now(timezone.utc)
    bill.save(update_fields=["bill_number", "journal_entry", "status", "posted_at"])
    return bill


@transaction.atomic
def reverse_bill(bill: VendorBill, created_by=None) -> VendorBill:
    """POSTED → CANCELLED: reverses the linked G/L document (never deletes)."""
    bill = VendorBill.objects.select_for_update().get(pk=bill.pk)
    if bill.status != VendorBill.Status.POSTED:
        raise BillError(f"Only posted bills can be reversed (is '{bill.status}').")
    if not bill.journal_entry_id:
        raise BillError("Bill has no linked journal entry to reverse.")
    if bill.paid_amount > 0:
        raise BillError("Cannot reverse a bill with payments allocated against it.")
    if bill.debited_amount > 0:
        raise BillError("Cannot reverse a bill with debit notes issued against it.")

    reverse_journal_entry(bill.journal_entry, created_by=created_by)
    bill.status = VendorBill.Status.CANCELLED
    bill.save(update_fields=["status"])
    return bill


def _next_debit_note_number(tenant, company_code) -> str:
    last = (
        DebitNote.objects.filter(tenant=tenant, company_code=company_code)
        .exclude(debit_note_number="")
        .aggregate(mx=models.Max("debit_note_number"))
    )["mx"]
    seq = (int(last.split("-")[-1]) + 1) if last else 1
    return f"DN-{seq:05d}"


@transaction.atomic
def post_debit_note(note: DebitNote) -> DebitNote:
    """Mirrors post_bill with debit/credit flipped:
        Dr  Trade Payables (recon)              grand total
            Cr  Expense (per line)               line base
            Cr  Input tax (per component)        per component
    Reduces what we owe the vendor without touching cash."""
    note = DebitNote.objects.select_for_update().get(pk=note.pk)
    if note.status != DebitNote.Status.DRAFT:
        raise BillError(f"Only draft debit notes can be posted (is '{note.status}').")
    if note.bill.status != VendorBill.Status.POSTED:
        raise BillError("Debit notes can only be issued against a posted bill.")

    lines = list(note.lines.select_related("expense_account", "tax_slab").all())
    if not lines:
        raise BillError("Debit note has no lines.")

    tenant = note.tenant
    cc: CompanyCode = note.company_code
    coa = cc.chart_of_accounts
    region = determine_region(cc.state, note.vendor.state)

    expense_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    tax_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))

    payable_acct = note.vendor.payable_account or _acct(tenant, coa, DEFAULT_PAYABLE)
    default_expense = _acct(tenant, coa, DEFAULT_EXPENSE)
    if not payable_acct:
        raise BillError("No Trade Payables account configured.")

    if not note.debit_note_number:
        note.debit_note_number = _next_debit_note_number(tenant, cc)

    DebitNoteLineTax.objects.filter(line__debit_note=note).delete()

    for ln in lines:
        base = ln.amount
        exp_acct = ln.expense_account or default_expense
        if not exp_acct:
            raise BillError("No expense account for a line.")
        expense_by_acct[str(exp_acct.id)] += base

        slab = ln.tax_slab
        if slab:
            for tl in compute_tax(slab, region, base):
                DebitNoteLineTax.objects.create(
                    tenant=tenant, line=ln, component_id=tl.component_id,
                    percentage=tl.percentage, amount=tl.amount,
                )
                acct = _input_account_for(tl.component_id)
                if not acct:
                    raise BillError(f"Tax component {tl.component_code} has no input G/L account.")
                tax_by_acct[str(acct.id)] += tl.amount

    fx_rate = get_exchange_rate(tenant, note.currency, cc.currency, note.note_date)
    to_base = (lambda amt: _d2(amt * fx_rate)) if fx_rate != 1 else _d2
    expense_by_acct_base = {k: to_base(v) for k, v in expense_by_acct.items()}
    tax_by_acct_base = {k: to_base(v) for k, v in tax_by_acct.items()}
    payable_total_base = sum(expense_by_acct_base.values(), Decimal("0.00")) + sum(tax_by_acct_base.values(), Decimal("0.00"))

    je = JournalEntry.objects.create(
        tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.DEBIT_NOTE,
        posting_date=note.note_date, document_date=note.note_date,
        currency=cc.currency, exchange_rate=fx_rate,
        header_text=f"Debit note · {note.vendor.name}" + (f" ({note.reason})" if note.reason else ""),
        source_type=JournalEntry.SourceType.AP_DEBIT_NOTE,
        source_id=note.id, source_number=note.debit_note_number,
        party_type=JournalEntry.PartyType.VENDOR,
        party_code=note.vendor.code, party_name=note.vendor.name,
        reference=note.bill.bill_number,
    )
    n = 1
    JournalEntryLine.objects.create(
        tenant=tenant, journal_entry=je, line_number=n, gl_account=payable_acct,
        debit_credit=JournalEntryLine.DC.DEBIT, amount=payable_total_base,
        posting_key="21",  # SAP: vendor debit memo (debit)
        assignment=note.vendor.code,
        line_text=f"Payable debit · {note.vendor.name}",
    )
    for acct_id, amt in expense_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.CREDIT, amount=amt, line_text="Expense reversal",
        )
    for acct_id, amt in tax_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.CREDIT, amount=amt, line_text="Input tax reversal",
        )

    je = post_journal_entry(je)

    note.journal_entry = je
    note.status = DebitNote.Status.POSTED
    note.posted_at = datetime.now(timezone.utc)
    note.save(update_fields=["debit_note_number", "journal_entry", "status", "posted_at"])
    return note


@transaction.atomic
def reverse_debit_note(note: DebitNote, created_by=None) -> DebitNote:
    """POSTED → CANCELLED: reverses the linked G/L document (never deletes)."""
    note = DebitNote.objects.select_for_update().get(pk=note.pk)
    if note.status != DebitNote.Status.POSTED:
        raise BillError(f"Only posted debit notes can be reversed (is '{note.status}').")
    if not note.journal_entry_id:
        raise BillError("Debit note has no linked journal entry to reverse.")

    reverse_journal_entry(note.journal_entry, created_by=created_by)
    note.status = DebitNote.Status.CANCELLED
    note.save(update_fields=["status"])
    return note
