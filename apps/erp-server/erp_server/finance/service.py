"""
G/L posting service — the SAP document principle enforced in one place.

post_journal_entry() is the ONLY sanctioned path from DRAFT -> POSTED:
  1. the document must balance (sum debits == sum credits, > 0),
  2. a sequential document number is assigned per (company code, fiscal year),
  3. the document becomes immutable.

reverse_journal_entry() creates a linked mirror document (never deletes).
"""
from __future__ import annotations

from datetime import datetime, timezone

from django.db import models, transaction

from decimal import Decimal

from .models import ExchangeRate, JournalEntry, JournalEntryLine, PostingPeriod


class PostingError(Exception):
    """Raised when a document cannot be posted (unbalanced, wrong state, no lines)."""


def get_exchange_rate(tenant, currency: str, base_currency: str, as_of_date):
    """1 unit of `currency` in `base_currency`, as of the latest rate on/before
    `as_of_date`. Same currency as the base always returns 1."""
    if currency == base_currency:
        return Decimal("1")
    rate = (
        ExchangeRate.objects.filter(tenant=tenant, currency=currency, rate_date__lte=as_of_date)
        .order_by("-rate_date")
        .first()
    )
    if not rate:
        raise PostingError(f"No exchange rate for {currency} on or before {as_of_date}.")
    return rate.rate_to_base


def _check_period_open(entry: JournalEntry) -> None:
    """Refuse to post into a closed period. Silent (no-op) if the period isn't
    configured at all — only an explicitly closed period blocks posting."""
    period = PostingPeriod.objects.filter(
        fiscal_year__company_code_id=entry.company_code_id,
        fiscal_year__year=entry.posting_date.year,
        period=entry.posting_date.month,
    ).first()
    if period and not period.is_open:
        raise PostingError(
            f"Posting period {period.period:02d}/{period.fiscal_year.year} is closed."
        )


def _next_document_number(company_code_id, fiscal_year: int) -> str:
    """Sequential per company code + fiscal year, e.g. '1900000001'."""
    last = (
        JournalEntry.objects.filter(
            company_code_id=company_code_id,
            fiscal_year=fiscal_year,
        )
        .exclude(document_number="")
        .aggregate(mx=models.Max("document_number"))
    )["mx"]
    seq = (int(last) + 1) if last else 1900000001
    return str(seq)


@transaction.atomic
def post_journal_entry(entry: JournalEntry) -> JournalEntry:
    entry = JournalEntry.objects.select_for_update().get(pk=entry.pk)

    if entry.status != JournalEntry.Status.DRAFT:
        raise PostingError(f"Only draft documents can be posted (is '{entry.status}').")

    lines = list(entry.lines.all())
    if len(lines) < 2:
        raise PostingError("A document needs at least two line items.")
    if not entry.is_balanced:
        raise PostingError(
            f"Document is not balanced: debit {entry.total_debit} ≠ credit {entry.total_credit}."
        )
    _check_period_open(entry)

    entry.fiscal_year = entry.posting_date.year
    entry.document_number = _next_document_number(entry.company_code_id, entry.fiscal_year)
    entry.status = JournalEntry.Status.POSTED
    entry.posted_at = datetime.now(timezone.utc)
    entry.save(update_fields=["fiscal_year", "document_number", "status", "posted_at"])
    return entry


@transaction.atomic
def reverse_journal_entry(entry: JournalEntry, posting_date=None, created_by=None) -> JournalEntry:
    if entry.status != JournalEntry.Status.POSTED:
        raise PostingError("Only posted documents can be reversed.")

    rev = JournalEntry.objects.create(
        tenant=entry.tenant,
        company_code=entry.company_code,
        document_type=entry.document_type,
        posting_date=posting_date or entry.posting_date,
        document_date=entry.document_date,
        currency=entry.currency,
        reference=entry.document_number,
        header_text=f"Reversal of {entry.document_number}",
        status=JournalEntry.Status.DRAFT,
        # Keep the reversal discoverable under the same business partner, but
        # mark it a reversal pointing back at the original document.
        source_type=JournalEntry.SourceType.REVERSAL,
        source_id=entry.id,
        source_number=entry.document_number,
        party_type=entry.party_type,
        party_code=entry.party_code,
        party_name=entry.party_name,
        reverses=entry,
        created_by=created_by,
    )
    # Mirror lines with flipped debit/credit, carrying all dimensions.
    flip = {
        JournalEntryLine.DC.DEBIT: JournalEntryLine.DC.CREDIT,
        JournalEntryLine.DC.CREDIT: JournalEntryLine.DC.DEBIT,
    }
    for ln in entry.lines.all():
        JournalEntryLine.objects.create(
            tenant=ln.tenant,
            journal_entry=rev,
            line_number=ln.line_number,
            gl_account=ln.gl_account,
            debit_credit=flip[ln.debit_credit],
            amount=ln.amount,
            line_text=f"Reversal: {ln.line_text}".strip(),
            assignment=ln.assignment,
            cost_center=ln.cost_center,
            profit_center=ln.profit_center,
            business_area=ln.business_area,
            segment=ln.segment,
        )

    rev = post_journal_entry(rev)
    entry.status = JournalEntry.Status.REVERSED
    entry.save(update_fields=["status"])
    return rev
