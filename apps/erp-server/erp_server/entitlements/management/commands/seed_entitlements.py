"""
Seed entitlements for a tenant. By default enables the full finance suite.
Usage: manage.py seed_entitlements --tenant abc
       manage.py seed_entitlements --tenant abc --keys finance.gl,finance.ar
"""
from django.core.management.base import BaseCommand, CommandError

from erp_server.entitlements.models import Entitlement
from erp_server.identity.models import Tenant

FINANCE_SUITE = {
    "finance.gl": "General Ledger",
    "finance.tax": "Tax Engine",
    "finance.ar": "Accounts Receivable",
    "finance.ap": "Accounts Payable",
    "finance.aa": "Asset Accounting",
    "finance.co": "Controlling",
}


class Command(BaseCommand):
    help = "Seed entitlements (licensed features) for a tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--keys", default="", help="comma-separated keys; default = full finance suite")

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")
        keys = [k.strip() for k in opts["keys"].split(",") if k.strip()] or list(FINANCE_SUITE)
        for k in keys:
            Entitlement.objects.update_or_create(
                tenant=tenant, key=k, defaults={"name": FINANCE_SUITE.get(k, k), "enabled": True},
            )
        self.stdout.write(self.style.SUCCESS(
            f"[OK] Entitlements for {tenant.name}: {', '.join(keys)}"
        ))
