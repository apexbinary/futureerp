"""Depreciation run — posts one period's straight-line depreciation for active assets."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from django.db import transaction

from erp_server.finance.models import CompanyCode, GLAccount, JournalEntry, JournalEntryLine
from erp_server.finance.service import post_journal_entry

from .models import DepreciationEntry, FixedAsset

ZERO = Decimal("0.00")
DEFAULT_ACCUM = "150100"      # Accumulated Depreciation
DEFAULT_EXPENSE = "540000"    # Depreciation Expense


def _acct(tenant, coa, number):
    return GLAccount.objects.filter(tenant=tenant, chart_of_accounts=coa, account_number=number).first()


@transaction.atomic
def run_depreciation(tenant, company_code: CompanyCode, period_date: date) -> dict:
    """Post depreciation for `period_date`'s month for all active assets that haven't
    been depreciated that month and still have book value above salvage."""
    period = period_date.strftime("%Y-%m")
    coa = company_code.chart_of_accounts
    accum_default = _acct(tenant, coa, DEFAULT_ACCUM)
    exp_default = _acct(tenant, coa, DEFAULT_EXPENSE)

    posted, skipped, total = [], 0, ZERO
    assets = FixedAsset.objects.filter(
        tenant=tenant, company_code=company_code,
        status=FixedAsset.Status.ACTIVE, is_archived=False,
    )
    for asset in assets:
        if DepreciationEntry.objects.filter(asset=asset, period=period).exists():
            skipped += 1
            continue
        remaining = asset.depreciable_base - asset.accumulated_depreciation
        if remaining <= 0:
            skipped += 1
            continue
        amount = min(asset.monthly_depreciation, remaining)
        if amount <= 0:
            skipped += 1
            continue

        exp = asset.dep_expense_account or exp_default
        accum = asset.accum_dep_account or accum_default
        if not exp or not accum:
            raise RuntimeError("Depreciation Expense / Accumulated Depreciation account missing.")

        je = JournalEntry.objects.create(
            tenant=tenant, company_code=company_code, document_type=JournalEntry.DocumentType.GENERAL,
            posting_date=period_date, document_date=period_date, currency="INR",
            header_text=f"Depreciation {period} · {asset.name}",
            source_type=JournalEntry.SourceType.DEPRECIATION,
            source_id=asset.id, source_number=asset.code,
        )
        JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=1, gl_account=exp,
                                        debit_credit=JournalEntryLine.DC.DEBIT, amount=amount, line_text="Depreciation")
        JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=2, gl_account=accum,
                                        debit_credit=JournalEntryLine.DC.CREDIT, amount=amount, line_text="Accumulated depreciation")
        je = post_journal_entry(je)

        DepreciationEntry.objects.create(
            tenant=tenant, asset=asset, period=period, period_date=period_date,
            amount=amount, journal_entry=je,
        )
        posted.append({"asset": asset.code, "amount": str(amount), "document": je.document_number})
        total += amount

    return {"period": period, "posted": posted, "skipped": skipped,
            "count": len(posted), "total_depreciation": str(total)}
