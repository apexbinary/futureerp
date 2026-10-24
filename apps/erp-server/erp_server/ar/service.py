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
from erp_server.finance.service import post_journal_entry, reverse_journal_entry
from erp_server.tax.service import compute_tax, determine_region

from .models import CustomerInvoice, CustomerInvoiceLineTax


class InvoiceError(Exception):
    pass


DEFAULT_RECEIVABLE = "110000"   # Trade Receivables
DEFAULT_REVENUE = "400000"      # Sales Revenue


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

    # Build the balanced journal entry.
    je = JournalEntry.objects.create(
        tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.CUSTOMER_INVOICE,
        posting_date=invoice.invoice_date, document_date=invoice.invoice_date,
        currency=invoice.currency, header_text=f"Customer invoice · {invoice.customer.name}",
        source_type=JournalEntry.SourceType.AR_INVOICE,
        source_id=invoice.id, source_number=invoice.invoice_number,
        party_type=JournalEntry.PartyType.CUSTOMER,
        party_code=invoice.customer.code, party_name=invoice.customer.name,
    )
    n = 1
    JournalEntryLine.objects.create(
        tenant=tenant, journal_entry=je, line_number=n, gl_account=receivable_acct,
        debit_credit=JournalEntryLine.DC.DEBIT, amount=receivable_total,
        posting_key="01",  # SAP: customer invoice (debit)
        assignment=invoice.customer.code,
        line_text=f"Receivable · {invoice.customer.name}",
    )
    for acct_id, amt in revenue_by_acct.items():
        n += 1
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account_id=acct_id,
            debit_credit=JournalEntryLine.DC.CREDIT, amount=amt, line_text="Revenue",
        )
    for acct_id, amt in tax_by_acct.items():
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

    reverse_journal_entry(invoice.journal_entry, created_by=created_by)
    invoice.status = CustomerInvoice.Status.CANCELLED
    invoice.save(update_fields=["status"])
    return invoice


def _output_account_for(component_id) -> GLAccount | None:
    from erp_server.tax.models import TaxComponent
    comp = TaxComponent.objects.select_related("output_account").filter(pk=component_id).first()
    return comp.output_account if comp else None
