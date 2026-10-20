"""Seed CO cost centers for a tenant. Usage: manage.py seed_co --tenant abc"""
from django.core.management.base import BaseCommand, CommandError

from erp_server.co.models import CostCenter, ProfitCenter
from erp_server.identity.models import Tenant

CENTERS = [
    ("CC-100", "Sales & Marketing", "Kunal Mehta"),
    ("CC-200", "Operations", "Priya Patel"),
    ("CC-300", "Administration", "Ravi Shah"),
]
PROFIT_CENTERS = [
    ("PC-100", "Retail Division", "Kunal Mehta"),
    ("PC-200", "Wholesale Division", "Priya Patel"),
]


class Command(BaseCommand):
    help = "Seed CO cost centers for a tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")
        for code, name, mgr in CENTERS:
            CostCenter.objects.update_or_create(tenant=tenant, code=code, defaults={"name": name, "manager": mgr})
        for code, name, mgr in PROFIT_CENTERS:
            ProfitCenter.objects.update_or_create(tenant=tenant, code=code, defaults={"name": name, "manager": mgr})
        self.stdout.write(self.style.SUCCESS(
            f"[OK] CO seeded for {tenant.name}: {CostCenter.objects.filter(tenant=tenant).count()} cost centers, "
            f"{ProfitCenter.objects.filter(tenant=tenant).count()} profit centers."
        ))
