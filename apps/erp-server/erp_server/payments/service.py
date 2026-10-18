"""Payment posting — generates the balanced 2-line G/L document."""
from __future__ import annotations

from datetime import datetime, timezone

from django.db import models, transaction

from erp_server.finance.models import GLAccount, JournalEntry, JournalEntryLine
from erp_server.finance.service import post_journal_entry

from .models import Payment


class PaymentError(Exception):
    pass


DEFAULT_BANK = "100100"
DEFAULT_RECEIVABLE = "110000"
DEFAULT_PAYABLE = "200000"


def _acct(tenant, coa, number):
    return GLAccount.objects.filter(tenant=tenant, chart_of_accounts=coa, account_number=number).first()


def _next_number(tenant, cc, direction) -> str:
    prefix = "RCPT" if direction == Payment.Direction.RECEIPT else "PAY"
    last = (
        Payment.objects.filter(tenant=tenant, company_code=cc, direction=direction)
        .exclude(payment_number="").aggregate(mx=models.Max("payment_number"))
    )["mx"]
    seq = (int(last.split("-")[-1]) + 1) if last else 1
    return f"{prefix}-{seq:05d}"


@transaction.atomic
def post_payment(p: Payment) -> Payment:
    p = Payment.objects.select_for_update().get(pk=p.pk)
    if p.status != Payment.Status.DRAFT:
        raise PaymentError(f"Only draft payments can be posted (is '{p.status}').")
    if p.amount <= 0:
        raise PaymentError("Amount must be greater than zero.")

    tenant, cc = p.tenant, p.company_code
    coa = cc.chart_of_accounts
    bank = p.bank_account or _acct(tenant, coa, DEFAULT_BANK)
    if not bank:
        raise PaymentError("No bank account configured.")

    if p.direction == Payment.Direction.RECEIPT:
        if not p.customer_id:
            raise PaymentError("Receipt needs a customer.")
        recv = p.customer.receivable_account or _acct(tenant, coa, DEFAULT_RECEIVABLE)
        debit_acct, credit_acct = bank, recv        # Dr Bank, Cr Receivables
        head = f"Receipt · {p.customer.name}"
    else:
        if not p.vendor_id:
            raise PaymentError("Payment needs a vendor.")
        pay = p.vendor.payable_account or _acct(tenant, coa, DEFAULT_PAYABLE)
        debit_acct, credit_acct = pay, bank         # Dr Payables, Cr Bank
        head = f"Payment · {p.vendor.name}"

    je = JournalEntry.objects.create(
        tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.GENERAL,
        posting_date=p.payment_date, document_date=p.payment_date, currency="INR", header_text=head,
    )
    JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=1, gl_account=debit_acct,
                                    debit_credit=JournalEntryLine.DC.DEBIT, amount=p.amount, line_text=head)
    JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=2, gl_account=credit_acct,
                                    debit_credit=JournalEntryLine.DC.CREDIT, amount=p.amount, line_text=head)
    je = post_journal_entry(je)

    p.payment_number = _next_number(tenant, cc, p.direction)
    p.journal_entry = je
    p.status = Payment.Status.POSTED
    p.posted_at = datetime.now(timezone.utc)
    p.save(update_fields=["payment_number", "journal_entry", "status", "posted_at"])
    return p
