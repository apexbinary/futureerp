"""
AR invoice posting — the keystone that ties AR + Tax + General Ledger together.

post_invoice():
  1. for each line → determine region (company state vs customer state),
     compute the tax split (tax engine), snapshot CustomerInvoiceLineTax rows,
  2. build a balanced G/L JournalEntry:
         Dr  Trade Receivables (recon)         grand total (incl. tax)
             Cr  Revenue (per revenue account)  sum of line bases
             Cr  Output tax (per component acct) sum per tax component
  3. post the journal entry (finance.service enforces debits == credits),
  4. number the invoice, link the document, mark POSTED.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from django.db import models, transaction

from erp_server.finance.models import CompanyCode, GLAccount, JournalEntry, JournalEntryLine
from erp_server.finance.service import get_exchange_rate, post_journal_entry, reverse_journal_entry
from erp_server.tax.service import compute_tax, determine_region

from .models import CreditNote, CreditNoteLineTax, CustomerInvoice, CustomerInvoiceLineTax


class InvoiceError(Exception):
    pass


DEFAULT_RECEIVABLE = "110000"   # Trade Receivables
DEFAULT_REVENUE = "400000"      # Sales Revenue


def _d2(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"))


def _acct(tenant, coa, number) -> GLAccount | None:
    return GLAccount.objects.filter(tenant=tenant, chart_of_accounts=coa, account_number=number).first()


def _next_invoice_number(tenant, company_code) -> str:
    last = (
        CustomerInvoice.objects.filter(tenant=tenant, company_code=company_code)
        .exclude(invoice_number="")
        .aggregate(mx=models.Max("invoice_number"))
    )["mx"]
    # format INV-00001
    seq = (int(last.split("-")[-1]) + 1) if last else 1
    return f"INV-{seq:05d}"


@transaction.atomic
def post_invoice(invoice: CustomerInvoice) -> CustomerInvoice:
    invoice = CustomerInvoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.status != CustomerInvoice.Status.DRAFT:
        raise InvoiceError(f"Only draft invoices can be posted (is '{invoice.status}').")

    lines = list(invoice.lines.select_related("item", "tax_slab").all())
    if not lines:
        raise InvoiceError("Invoice has no lines.")

    tenant = invoice.tenant
    cc: CompanyCode = invoice.company_code
    coa = cc.chart_of_accounts
    region = determine_region(cc.state, invoice.customer.state)

    # Accumulate G/L postings.
    revenue_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    tax_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    receivable_total = Decimal("0.00")

    receivable_acct = invoice.customer.receivable_account or _acct(tenant, coa, DEFAULT_RECEIVABLE)
    default_revenue = _acct(tenant, coa, DEFAULT_REVENUE)
    if not receivable_acct:
        raise InvoiceError("No Trade Receivables account configured.")

    # Number the invoice up-front so the G/L document can carry it as its source reference.
    if not invoice.invoice_number:
        invoice.invoice_number = _next_invoice_number(tenant, cc)

    # Clear any prior tax snapshot (re-post safety).
    CustomerInvoiceLineTax.objects.filter(line__invoice=invoice).delete()

    for ln in lines:
        base = ln.amount
        rev_acct = (ln.item.revenue_account if ln.item else None) or default_revenue
        if not rev_acct:
            raise InvoiceError("No revenue account for a line.")
        revenue_by_acct[str(rev_acct.id)] += base
        receivable_total += base

        slab = ln.tax_slab or (ln.item.tax_slab if ln.item else None)
        if slab:
            for tl in compute_tax(slab, region, base):
                CustomerInvoiceLineTax.objects.create(
                    tenant=tenant, line=ln, component_id=tl.component_id,
                    percentage=tl.percentage, amount=tl.amount,
                )
                comp_acct = _output_account_for(tl.component_id)
                if not comp_acct:
                    raise InvoiceError(f"Tax component {tl.component_code} has no output G/L account.")
                tax_by_acct[str(comp_acct.id)] += tl.amount
                receivable_total += tl.amount

    # The ledger always books in the company's functional currency — a foreign-currency
    # invoice is converted here; the invoice itself keeps its original currency amounts.
    # Convert each credit bucket first, then derive the debit (receivable) as their
    # sum — never convert it independently, or per-line rounding could leave the
    # document a paisa out of balance.
    fx_rate = get_exchange_rate(tenant, invoice.currency, cc.currency, invoice.invoice_date)
    to_base = (lambda amt: _d2(amt * fx_rate)) if fx_rate != 1 else _d2
    revenue_by_acct_base = {k: to_base(v) for k, v in revenue_by_acct.items()}
    tax_by_acct_base = {k: to_base(v) for k, v in tax_by_acct.items()}
    receivable_total_base = sum(revenue_by_acct_base.values(), Decimal("0.00")) + sum(tax_by_acct_base.values(), Decimal("0.00"))

    # Build the balanced journal entry.
    je = JournalEntry.objects.create(
        tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.CUSTOMER_INVOICE,
        posting_date=invoice.invoice_date, document_date=invoice.invoice_date,
        currency=cc.currency, exchange_rate=fx_rate, header_text=f"Customer invoice · {invoice.customer.name}",
        source_type=JournalEntry.SourceType.AR_INVOICE,
        source_id=invoice.id, source_number=invoice.invoice_number,
        party_type=JournalEntry.PartyType.CUSTOMER,
        party_code=invoice.customer.code, party_name=invoice.customer.name,
    )
    n = 1
    JournalEntryLine.objects.create(
        tenant=tenant, journal_entry=je, line_number=n, gl_account=receivable_acct,
        debit_credit=JournalEntryLine.DC.DEBIT, amount=receivable_total_base,
        posting_key="01",  # SAP: customer invoice (debit)
        assignment=invoice.customer.code,
        line_text=f"Receivable · {invoice.customer.name}",
    )
    for acct_id, amt in revenue_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.CREDIT, amount=amt, line_text="Revenue",
        )
    for acct_id, amt in tax_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.CREDIT, amount=amt, line_text="Output tax",
        )

    je = post_journal_entry(je)   # enforces debits == credits

    invoice.journal_entry = je
    invoice.status = CustomerInvoice.Status.POSTED
    invoice.posted_at = datetime.now(timezone.utc)
    invoice.save(update_fields=["invoice_number", "journal_entry", "status", "posted_at"])
    return invoice


@transaction.atomic
def reverse_invoice(invoice: CustomerInvoice, created_by=None) -> CustomerInvoice:
    """POSTED → CANCELLED: reverses the linked G/L document (never deletes)."""
    invoice = CustomerInvoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.status != CustomerInvoice.Status.POSTED:
        raise InvoiceError(f"Only posted invoices can be reversed (is '{invoice.status}').")
    if not invoice.journal_entry_id:
        raise InvoiceError("Invoice has no linked journal entry to reverse.")
    if invoice.paid_amount > 0:
        raise InvoiceError("Cannot reverse an invoice with payments allocated against it.")
    if invoice.credited_amount > 0:
        raise InvoiceError("Cannot reverse an invoice with credit notes issued against it.")

    reverse_journal_entry(invoice.journal_entry, created_by=created_by)
    invoice.status = CustomerInvoice.Status.CANCELLED
    invoice.save(update_fields=["status"])
    return invoice


def _output_account_for(component_id) -> GLAccount | None:
    from erp_server.tax.models import TaxComponent
    comp = TaxComponent.objects.select_related("output_account").filter(pk=component_id).first()
    return comp.output_account if comp else None


def _next_credit_note_number(tenant, company_code) -> str:
    last = (
        CreditNote.objects.filter(tenant=tenant, company_code=company_code)
        .exclude(credit_note_number="")
        .aggregate(mx=models.Max("credit_note_number"))
    )["mx"]
    seq = (int(last.split("-")[-1]) + 1) if last else 1
    return f"CN-{seq:05d}"


@transaction.atomic
def post_credit_note(note: CreditNote) -> CreditNote:
    """Mirrors post_invoice with debit/credit flipped:
        Dr  Revenue (per line)                 line base
        Dr  Output tax (per component)         per component
            Cr  Trade Receivables (recon)       grand total
    Reduces what the customer owes without touching cash."""
    note = CreditNote.objects.select_for_update().get(pk=note.pk)
    if note.status != CreditNote.Status.DRAFT:
        raise InvoiceError(f"Only draft credit notes can be posted (is '{note.status}').")
    if note.invoice.status != CustomerInvoice.Status.POSTED:
        raise InvoiceError("Credit notes can only be issued against a posted invoice.")

    lines = list(note.lines.select_related("item", "tax_slab").all())
    if not lines:
        raise InvoiceError("Credit note has no lines.")

    tenant = note.tenant
    cc: CompanyCode = note.company_code
    coa = cc.chart_of_accounts
    region = determine_region(cc.state, note.customer.state)

    revenue_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    tax_by_acct: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))

    receivable_acct = note.customer.receivable_account or _acct(tenant, coa, DEFAULT_RECEIVABLE)
    default_revenue = _acct(tenant, coa, DEFAULT_REVENUE)
    if not receivable_acct:
        raise InvoiceError("No Trade Receivables account configured.")

    if not note.credit_note_number:
        note.credit_note_number = _next_credit_note_number(tenant, cc)

    CreditNoteLineTax.objects.filter(line__credit_note=note).delete()

    for ln in lines:
        base = ln.amount
        rev_acct = (ln.item.revenue_account if ln.item else None) or default_revenue
        if not rev_acct:
            raise InvoiceError("No revenue account for a line.")
        revenue_by_acct[str(rev_acct.id)] += base

        slab = ln.tax_slab or (ln.item.tax_slab if ln.item else None)
        if slab:
            for tl in compute_tax(slab, region, base):
                CreditNoteLineTax.objects.create(
                    tenant=tenant, line=ln, component_id=tl.component_id,
                    percentage=tl.percentage, amount=tl.amount,
                )
                comp_acct = _output_account_for(tl.component_id)
                if not comp_acct:
                    raise InvoiceError(f"Tax component {tl.component_code} has no output G/L account.")
                tax_by_acct[str(comp_acct.id)] += tl.amount

    fx_rate = get_exchange_rate(tenant, note.currency, cc.currency, note.note_date)
    to_base = (lambda amt: _d2(amt * fx_rate)) if fx_rate != 1 else _d2
    revenue_by_acct_base = {k: to_base(v) for k, v in revenue_by_acct.items()}
    tax_by_acct_base = {k: to_base(v) for k, v in tax_by_acct.items()}
    receivable_total_base = sum(revenue_by_acct_base.values(), Decimal("0.00")) + sum(tax_by_acct_base.values(), Decimal("0.00"))

    je = JournalEntry.objects.create(
        tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.CREDIT_NOTE,
        posting_date=note.note_date, document_date=note.note_date,
        currency=cc.currency, exchange_rate=fx_rate,
        header_text=f"Credit note · {note.customer.name}" + (f" ({note.reason})" if note.reason else ""),
        source_type=JournalEntry.SourceType.AR_CREDIT_NOTE,
        source_id=note.id, source_number=note.credit_note_number,
        party_type=JournalEntry.PartyType.CUSTOMER,
        party_code=note.customer.code, party_name=note.customer.name,
        reference=note.invoice.invoice_number,
    )
    n = 0
    for acct_id, amt in revenue_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.DEBIT, amount=amt, line_text="Revenue reversal",
        )
    for acct_id, amt in tax_by_acct_base.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.DEBIT, amount=amt, line_text="Output tax reversal",
        )
    n += 1
    JournalEntryLine.objects.create(
        tenant=tenant, journal_entry=je, line_number=n, gl_account=receivable_acct,
        debit_credit=JournalEntryLine.DC.CREDIT, amount=receivable_total_base,
        posting_key="11",  # SAP: customer credit memo (credit)
        assignment=note.customer.code,
        line_text=f"Receivable credit · {note.customer.name}",
    )

    je = post_journal_entry(je)

    note.journal_entry = je
    note.status = CreditNote.Status.POSTED
    note.posted_at = datetime.now(timezone.utc)
    note.save(update_fields=["credit_note_number", "journal_entry", "status", "posted_at"])
    return note


@transaction.atomic
def reverse_credit_note(note: CreditNote, created_by=None) -> CreditNote:
    """POSTED → CANCELLED: reverses the linked G/L document (never deletes)."""
    note = CreditNote.objects.select_for_update().get(pk=note.pk)
    if note.status != CreditNote.Status.POSTED:
        raise InvoiceError(f"Only posted credit notes can be reversed (is '{note.status}').")
    if not note.journal_entry_id:
        raise InvoiceError("Credit note has no linked journal entry to reverse.")

    reverse_journal_entry(note.journal_entry, created_by=created_by)
    note.status = CreditNote.Status.CANCELLED
    note.save(update_fields=["status"])
    return note
