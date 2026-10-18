"""Seed AP vendors for a tenant. Requires seed_finance first. Usage: manage.py seed_ap --tenant abc"""
from django.core.management.base import BaseCommand, CommandError

from erp_server.ap.models import Vendor
from erp_server.identity.models import Tenant

VENDORS = [
    ("V-2001", "Maharashtra Paper Co.", "27AAFCM1111A1Z3", "Maharashtra", "sales@mhpaper.example"),
    ("V-2002", "Delhi Logistics Ltd.", "07AABCD2222A1Z1", "Delhi", "ap@delhilog.example"),
    ("V-2003", "Karnataka Components", "29AAACK3333A1Z7", "Karnataka", "billing@knc.example"),
]


class Command(BaseCommand):
    help = "Seed AP vendors for a tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")
        for code, name, gstin, state, email in VENDORS:
            Vendor.objects.update_or_create(
                tenant=tenant, code=code,
                defaults={"name": name, "gstin": gstin, "state": state, "email": email},
            )
        self.stdout.write(self.style.SUCCESS(
            f"[OK] AP seeded for {tenant.name}: {Vendor.objects.filter(tenant=tenant).count()} vendors."
        ))
