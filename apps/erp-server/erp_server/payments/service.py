"""
Payment posting — generates the G/L document.

For a same-currency settlement this is the classic 2-line document (Dr Bank / Cr
Receivables, or the mirror for a vendor payment). For a FOREIGN-currency invoice/bill,
a 3rd line recognizes the REALIZED FX gain or loss: the receivable/payable clears at
the rate frozen when it was originally booked, while the bank line moves at today's
rate — the difference is the gain/loss on that exchange-rate movement.

Revaluation is per PaymentAllocation row, summed — a payment split across several
invoices/bills (each possibly in a different currency, booked at a different rate)
is revalued correctly document-by-document. If no allocation rows exist yet (the
serializer creates them at Payment-create time, before posting — but direct-ORM
callers may not have), it falls back to the single Payment.invoice/.bill reference
against the full amount, then to the base currency (no revaluation) if neither
is set.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from django.db import models, transaction

from erp_server.finance.models import GLAccount, JournalEntry, JournalEntryLine
from erp_server.finance.service import get_exchange_rate, post_journal_entry, reverse_journal_entry

from .models import Payment


class PaymentError(Exception):
    pass


DEFAULT_BANK = "100100"
DEFAULT_RECEIVABLE = "110000"
DEFAULT_PAYABLE = "200000"
FX_GAIN = "450000"
FX_LOSS = "560000"


def _d2(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"))


def _acct(tenant, coa, number):
    return GLAccount.objects.filter(tenant=tenant, chart_of_accounts=coa, account_number=number).first()


def _revalue_one(tenant, cc, payment_date, amount, doc) -> tuple[Decimal, Decimal]:
    """(amount_now, amount_then) for one document's share of the payment.
    amount_now: that share converted at today's (payment-date) rate — the actual
                bank movement.
    amount_then: that share converted at the rate frozen when `doc` was booked —
                 what the subledger (receivable/payable) clears by."""
    if doc and doc.journal_entry_id:
        doc_currency, booked_rate = doc.currency, doc.journal_entry.exchange_rate
    else:
        doc_currency, booked_rate = cc.currency, Decimal("1")
    today_rate = get_exchange_rate(tenant, doc_currency, cc.currency, payment_date)
    return _d2(amount * today_rate), _d2(amount * booked_rate)


def _revalue(p: Payment, cc) -> tuple[Decimal, Decimal]:
    """(amount_now, amount_then), summed across every allocation."""
    allocations = list(p.allocations.select_related(
        "invoice__journal_entry", "bill__journal_entry",
    ).all())
    if not allocations:
        doc = None
        if p.direction == Payment.Direction.RECEIPT and p.invoice_id:
            doc = p.invoice
        elif p.direction == Payment.Direction.PAYMENT and p.bill_id:
            doc = p.bill
        return _revalue_one(p.tenant, cc, p.payment_date, p.amount, doc)

    # One payment is one bank movement in one currency — reject a split across
    # documents that are themselves in different currencies (that isn't a real
    # single transaction, and there'd be no single meaningful FX rate for it).
    currencies = {(a.invoice or a.bill).currency for a in allocations if (a.invoice or a.bill)}
    if len(currencies) > 1:
        raise PaymentError(
            f"Can't settle items in different currencies ({', '.join(sorted(currencies))}) "
            "with one payment — split into separate payments."
        )

    amount_now = amount_then = Decimal("0.00")
    for a in allocations:
        doc = a.invoice or a.bill
        now_i, then_i = _revalue_one(p.tenant, cc, p.payment_date, a.amount, doc)
        amount_now += now_i
        amount_then += then_i
    return amount_now, amount_then


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
        src_type = JournalEntry.SourceType.AR_RECEIPT
        party_type, party_code, party_name = (
            JournalEntry.PartyType.CUSTOMER, p.customer.code, p.customer.name)
        # SAP posting keys: 40 Dr bank, 15 Cr customer (incoming payment).
        debit_pk, credit_pk = "40", "15"
    else:
        if not p.vendor_id:
            raise PaymentError("Payment needs a vendor.")
        pay = p.vendor.payable_account or _acct(tenant, coa, DEFAULT_PAYABLE)
        debit_acct, credit_acct = pay, bank         # Dr Payables, Cr Bank
        head = f"Payment · {p.vendor.name}"
        src_type = JournalEntry.SourceType.AP_PAYMENT
        party_type, party_code, party_name = (
            JournalEntry.PartyType.VENDOR, p.vendor.code, p.vendor.name)
        # SAP posting keys: 25 Dr vendor (outgoing payment), 50 Cr bank.
        debit_pk, credit_pk = "25", "50"

    if not p.payment_number:
        p.payment_number = _next_number(tenant, cc, p.direction)

    # Revalue: the subledger (receivable/payable) clears at the rate frozen when it
    # was first booked; the bank side moves at today's rate. The gap is realized FX.
    # Summed per-allocation, so a split payment across several documents (each
    # possibly its own currency/booked rate) revalues correctly.
    amount_now, amount_then = _revalue(p, cc)
    fx_diff = amount_now - amount_then           # >0: doc currency strengthened vs base
    # Representative rate for the document header only — the actual postings below
    # are already correct per-allocation regardless of this single blended figure.
    blended_rate = (amount_now / p.amount).quantize(Decimal("0.000001")) if p.amount else Decimal("1")

    je = JournalEntry.objects.create(
        tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.GENERAL,
        posting_date=p.payment_date, document_date=p.payment_date, currency=cc.currency,
        exchange_rate=blended_rate, header_text=head, reference=p.reference or "",
        source_type=src_type, source_id=p.id, source_number=p.payment_number,
        party_type=party_type, party_code=party_code, party_name=party_name,
    )
    # The bank side always moves at today's rate; the recon (receivable/payable)
    # side always clears at the booked rate — which GL account is debit vs credit
    # just flips with direction (handled above via debit_acct/credit_acct).
    bank_amt, recon_amt = amount_now, amount_then
    JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=1, gl_account=debit_acct,
                                    debit_credit=JournalEntryLine.DC.DEBIT, posting_key=debit_pk,
                                    amount=bank_amt if p.direction == Payment.Direction.RECEIPT else recon_amt,
                                    line_text=head, assignment=party_code)
    JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=2, gl_account=credit_acct,
                                    debit_credit=JournalEntryLine.DC.CREDIT, posting_key=credit_pk,
                                    amount=recon_amt if p.direction == Payment.Direction.RECEIPT else bank_amt,
                                    line_text=head, assignment=party_code)

    if fx_diff != 0:
        # AR: diff>0 (received more base-currency value than booked) → gain.
        # AP: diff>0 (paying out more base-currency value than booked) → loss.
        is_gain = fx_diff > 0 if p.direction == Payment.Direction.RECEIPT else fx_diff < 0
        fx_amt = abs(fx_diff)
        fx_acct = _acct(tenant, coa, FX_GAIN if is_gain else FX_LOSS)
        if not fx_acct:
            raise PaymentError(f"No {'Realized FX Gain' if is_gain else 'Realized FX Loss'} account configured.")
        JournalEntryLine.objects.create(
            tenant=tenant, journal_entry=je, line_number=3, gl_account=fx_acct,
            debit_credit=JournalEntryLine.DC.CREDIT if is_gain else JournalEntryLine.DC.DEBIT,
            amount=fx_amt, line_text=f"Realized FX {'gain' if is_gain else 'loss'} on settlement",
        )

    je = post_journal_entry(je)

    p.journal_entry = je
    p.status = Payment.Status.POSTED
    p.posted_at = datetime.now(timezone.utc)
    p.save(update_fields=["payment_number", "journal_entry", "status", "posted_at"])
    return p


@transaction.atomic
def reverse_payment(p: Payment, created_by=None) -> Payment:
    """POSTED → CANCELLED: reverses the linked G/L document (never deletes).

    Allocations are left in place for the audit trail — CustomerInvoice/VendorBill
    .paid_amount only counts allocations whose payment is still 'posted', so moving
    this payment to 'cancelled' automatically restores the invoices'/bills' outstanding
    balances without touching PaymentAllocation rows.
    """
    p = Payment.objects.select_for_update().get(pk=p.pk)
    if p.status != Payment.Status.POSTED:
        raise PaymentError(f"Only posted payments can be reversed (is '{p.status}').")
    if not p.journal_entry_id:
        raise PaymentError("Payment has no linked journal entry to reverse.")

    reverse_journal_entry(p.journal_entry, created_by=created_by)
    p.status = Payment.Status.CANCELLED
    p.save(update_fields=["status"])
    return p
