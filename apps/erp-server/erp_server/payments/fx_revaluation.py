"""
Unrealized FX revaluation — the period-end mark-to-market step a real multi-currency
ledger needs alongside realized gain/loss on settlement (payments/service.py).

For every still-OPEN foreign-currency invoice/bill, compare its outstanding balance
at the rate frozen when it was booked against today's rate, and post the difference
to a receivable/payable adjustment + an Unrealized FX Gain/Loss P&L line.

This is a MARK-TO-MARKET estimate, not a permanent re-booking — it must not survive
into the next period's revaluation run uncorrected, or it would double-count against
the REALIZED gain/loss computed at actual settlement (which always compares against
the ORIGINAL booked rate, never a revalued one). So every run starts by reversing
whatever its own previous run posted for this company, then computes a fresh
snapshot from scratch at today's open balances and rate.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction

from erp_server.ap.models import VendorBill
from erp_server.ar.models import CustomerInvoice
from erp_server.finance.models import CompanyCode, GLAccount, JournalEntry, JournalEntryLine
from erp_server.finance.service import get_exchange_rate, post_journal_entry, reverse_journal_entry

ZERO = Decimal("0.00")
UNREALIZED_GAIN = "451000"
UNREALIZED_LOSS = "561000"
DEFAULT_RECEIVABLE = "110000"
DEFAULT_PAYABLE = "200000"


def _d2(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"))


def _acct(tenant, coa, number):
    return GLAccount.objects.filter(tenant=tenant, chart_of_accounts=coa, account_number=number).first()


@transaction.atomic
def revalue_open_items(tenant, company_code: CompanyCode, as_of: date) -> dict:
    coa = company_code.chart_of_accounts
    base_currency = company_code.currency

    # Undo our own prior estimate first — it was only ever a snapshot, never a
    # permanent entry. Re-running for the same `as_of` is therefore idempotent.
    prior = JournalEntry.objects.filter(
        tenant=tenant, company_code=company_code,
        source_type=JournalEntry.SourceType.FX_REVALUATION,
        status=JournalEntry.Status.POSTED,
    )
    reversed_count = 0
    for je in prior:
        reverse_journal_entry(je, posting_date=as_of)
        reversed_count += 1

    gain_acct = _acct(tenant, coa, UNREALIZED_GAIN)
    loss_acct = _acct(tenant, coa, UNREALIZED_LOSS)

    pending_lines = []  # (gl_account, debit_credit, amount, text)
    detail = []

    invoices = (
        CustomerInvoice.objects.filter(tenant=tenant, company_code=company_code, status=CustomerInvoice.Status.POSTED)
        .exclude(currency=base_currency)
        .select_related("journal_entry", "customer")
    )
    for inv in invoices:
        outstanding = inv.outstanding
        if outstanding <= 0 or not inv.journal_entry_id:
            continue
        booked_rate = inv.journal_entry.exchange_rate
        current_rate = get_exchange_rate(tenant, inv.currency, base_currency, as_of)
        current_value = _d2(outstanding * current_rate)
        booked_value = _d2(outstanding * booked_rate)
        diff = current_value - booked_value  # >0: receivable now worth more → gain
        if diff == 0:
            continue
        recv_acct = inv.customer.receivable_account or _acct(tenant, coa, DEFAULT_RECEIVABLE)
        if diff > 0:
            pending_lines.append((recv_acct, "D", diff, f"Unrealized FX · {inv.invoice_number}"))
            pending_lines.append((gain_acct, "C", diff, f"Unrealized FX · {inv.invoice_number}"))
        else:
            amt = -diff
            pending_lines.append((loss_acct, "D", amt, f"Unrealized FX · {inv.invoice_number}"))
            pending_lines.append((recv_acct, "C", amt, f"Unrealized FX · {inv.invoice_number}"))
        detail.append({"document": inv.invoice_number, "type": "invoice", "currency": inv.currency, "diff": str(diff)})

    bills = (
        VendorBill.objects.filter(tenant=tenant, company_code=company_code, status=VendorBill.Status.POSTED)
        .exclude(currency=base_currency)
        .select_related("journal_entry", "vendor")
    )
    for bill in bills:
        outstanding = bill.outstanding
        if outstanding <= 0 or not bill.journal_entry_id:
            continue
        booked_rate = bill.journal_entry.exchange_rate
        current_rate = get_exchange_rate(tenant, bill.currency, base_currency, as_of)
        current_value = _d2(outstanding * current_rate)
        booked_value = _d2(outstanding * booked_rate)
        diff = current_value - booked_value  # >0: payable now worth more → loss
        if diff == 0:
            continue
        pay_acct = bill.vendor.payable_account or _acct(tenant, coa, DEFAULT_PAYABLE)
        if diff > 0:
            pending_lines.append((loss_acct, "D", diff, f"Unrealized FX · {bill.bill_number}"))
            pending_lines.append((pay_acct, "C", diff, f"Unrealized FX · {bill.bill_number}"))
        else:
            amt = -diff
            pending_lines.append((pay_acct, "D", amt, f"Unrealized FX · {bill.bill_number}"))
            pending_lines.append((gain_acct, "C", amt, f"Unrealized FX · {bill.bill_number}"))
        detail.append({"document": bill.bill_number, "type": "bill", "currency": bill.currency, "diff": str(diff)})

    if not pending_lines:
        return {"as_of": as_of.isoformat(), "reversed_prior": reversed_count, "posted": False,
                "document": None, "items": []}

    if not gain_acct or not loss_acct:
        raise RuntimeError("Unrealized FX Gain/Loss accounts missing — run seed_finance.")

    je = JournalEntry.objects.create(
        tenant=tenant, company_code=company_code, document_type=JournalEntry.DocumentType.GENERAL,
        posting_date=as_of, document_date=as_of, currency=base_currency,
        header_text=f"Unrealized FX revaluation · {as_of.isoformat()}",
        source_type=JournalEntry.SourceType.FX_REVALUATION,
    )
    for n, (acct, dc, amt, text) in enumerate(pending_lines, start=1):
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=n, gl_account=acct,
            debit_credit=dc, amount=amt, line_text=text,
        )
    je = post_journal_entry(je)

    return {"as_of": as_of.isoformat(), "reversed_prior": reversed_count, "posted": True,
            "document": je.document_number, "items": detail}
