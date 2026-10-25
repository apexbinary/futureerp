"""
Seed Finance org structure for a tenant: a chart of accounts with standard G/L
accounts, one company code, and the current fiscal year with 12 open periods.

Usage: manage.py seed_finance --tenant abc
Idempotent: re-running updates/keeps existing records.
"""
import calendar
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from erp_server.finance.models import (
    ChartOfAccounts,
    CompanyCode,
    FiscalYear,
    GLAccount,
    PostingPeriod,
)
from erp_server.identity.models import Tenant

# account_number, name, type, statement, is_reconciliation
ACCOUNTS = [
    # Assets
    ("100000", "Cash", "asset", "balance_sheet", False),
    ("100100", "Bank — Current Account", "asset", "balance_sheet", False),
    ("110000", "Trade Receivables", "asset", "balance_sheet", True),   # AR recon
    ("120000", "Input GST (CGST)", "asset", "balance_sheet", False),
    ("120100", "Input GST (SGST)", "asset", "balance_sheet", False),
    ("120200", "Input GST (IGST)", "asset", "balance_sheet", False),
    ("150000", "Fixed Assets", "asset", "balance_sheet", True),        # AA recon
    ("150100", "Accumulated Depreciation", "asset", "balance_sheet", False),  # contra-asset
    ("160000", "Inventory", "asset", "balance_sheet", False),
    # Liabilities
    ("200000", "Trade Payables", "liability", "balance_sheet", True),  # AP recon
    ("210000", "Output GST (CGST)", "liability", "balance_sheet", False),
    ("210100", "Output GST (SGST)", "liability", "balance_sheet", False),
    ("210200", "Output GST (IGST)", "liability", "balance_sheet", False),
    ("220000", "Salaries Payable", "liability", "balance_sheet", False),
    # Equity
    ("300000", "Share Capital", "equity", "balance_sheet", False),
    ("310000", "Retained Earnings", "equity", "balance_sheet", False),
    # Revenue
    ("400000", "Sales Revenue", "revenue", "profit_loss", False),
    ("410000", "Service Revenue", "revenue", "profit_loss", False),
    ("450000", "Realized FX Gain", "revenue", "profit_loss", False),
    ("451000", "Unrealized FX Gain", "revenue", "profit_loss", False),
    # Expenses
    ("500000", "Cost of Goods Sold", "expense", "profit_loss", False),
    ("510000", "Office Supplies", "expense", "profit_loss", False),
    ("520000", "Rent Expense", "expense", "profit_loss", False),
    ("530000", "Salaries Expense", "expense", "profit_loss", False),
    ("540000", "Depreciation Expense", "expense", "profit_loss", False),
    ("560000", "Realized FX Loss", "expense", "profit_loss", False),
    ("561000", "Unrealized FX Loss", "expense", "profit_loss", False),
]


class Command(BaseCommand):
    help = "Seed Finance org structure (chart of accounts, company code, fiscal year) for a tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Tenant code (e.g. abc)")
        parser.add_argument("--year", type=int, default=date.today().year)

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")

        year = opts["year"]

        coa, _ = ChartOfAccounts.objects.get_or_create(
            tenant=tenant, code="INGA",
            defaults={"name": "India Operating Chart of Accounts",
                      "description": "Standard GST-ready chart"},
        )

        created = 0
        for number, name, atype, stmt, recon in ACCOUNTS:
            _, was_new = GLAccount.objects.get_or_create(
                chart_of_accounts=coa, account_number=number,
                defaults={
                    "tenant": tenant, "name": name, "account_type": atype,
                    "statement": stmt, "is_reconciliation": recon,
                },
            )
            created += int(was_new)

        cc, _ = CompanyCode.objects.get_or_create(
            tenant=tenant, code="1000",
            defaults={
                "name": f"{tenant.name} (India)", "currency": "INR",
                "country": "IN", "state": "Maharashtra", "chart_of_accounts": coa,
            },
        )
        if not cc.state:
            cc.state = "Maharashtra"
            cc.save(update_fields=["state"])

        fy, _ = FiscalYear.objects.get_or_create(
            company_code=cc, year=year,
            defaults={
                "tenant": tenant,
                "start_date": date(year, 1, 1), "end_date": date(year, 12, 31),
            },
        )
        for p in range(1, 13):
            last_day = calendar.monthrange(year, p)[1]
            PostingPeriod.objects.get_or_create(
                fiscal_year=fy, period=p,
                defaults={
                    "tenant": tenant,
                    "start_date": date(year, p, 1),
                    "end_date": date(year, p, last_day),
                    "is_open": True,
                },
            )

        self.stdout.write(self.style.SUCCESS(
            f"[OK] Finance seeded for {tenant.name}: COA {coa.code} "
            f"({GLAccount.objects.filter(chart_of_accounts=coa).count()} accounts, "
            f"{created} new), company code {cc.code}, FY{year} with 12 periods."
        ))
