"""Seed a few FX rates (to the company's INR functional currency) for a tenant.
Usage: manage.py seed_fx_rates --tenant abc"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from erp_server.finance.models import ExchangeRate
from erp_server.identity.models import Tenant

# currency -> (rate ~6 months ago, rate today) — linearly interpolated per month
RATES = {
    "USD": (Decimal("83.20"), Decimal("84.60")),
    "EUR": (Decimal("90.10"), Decimal("91.80")),
    "GBP": (Decimal("104.50"), Decimal("106.90")),
}


class Command(BaseCommand):
    help = "Seed FX rates (USD/EUR/GBP to INR) for a tenant, one per month for the last 6 months."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--months", type=int, default=6)

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")

        months = opts["months"]
        today = date.today()
        count = 0
        for currency, (start_rate, end_rate) in RATES.items():
            step = (end_rate - start_rate) / months
            for i in range(months + 1):
                rate_date = today - timedelta(days=30 * (months - i))
                rate = (start_rate + step * i).quantize(Decimal("0.0001"))
                _, created = ExchangeRate.objects.update_or_create(
                    tenant=tenant, currency=currency, rate_date=rate_date,
                    defaults={"rate_to_base": rate},
                )
                count += int(created)

        self.stdout.write(self.style.SUCCESS(
            f"[OK] FX rates seeded for {tenant.name}: {count} new rows across {len(RATES)} currencies."
        ))
