"""
Seed AR master data for a tenant: a few customers (intra & inter-state) and items
(wired to tax slabs + revenue account). Requires seed_finance + seed_tax first.
Usage: manage.py seed_ar --tenant abc
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from erp_server.ar.models import Customer, Item
from erp_server.finance.models import GLAccount
from erp_server.identity.models import Tenant
from erp_server.tax.models import TaxRateSlab

CUSTOMERS = [
    ("C-1001", "Sharma Textiles Pvt. Ltd.", "27AABCS1234A1Z5", "Maharashtra", "accounts@sharma.example"),
    ("C-1002", "Gulf Gate Trading", "24AABCG9999A1Z2", "Gujarat", "ap@gulfgate.example"),
    ("C-1003", "Chennai Suppliers Co.", "33AABCC4444A1Z9", "Tamil Nadu", "finance@chennaisup.example"),
]
# code, name, hsn, price, slab_code
ITEMS = [
    ("SKU-100", "Cotton Bedsheets (per set)", "6302", "1000.00", "GST18"),
    ("SKU-200", "Table Linen (per set)", "6302", "500.00", "GST12"),
    ("SKU-300", "Luxury Silk Drapes", "6303", "4000.00", "GST28"),
    ("SVC-010", "Design Consulting (per hour)", "9983", "2000.00", "GST18"),
]


class Command(BaseCommand):
    help = "Seed AR customers and items for a tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")

        for code, name, gstin, state, email in CUSTOMERS:
            Customer.objects.update_or_create(
                tenant=tenant, code=code,
                defaults={"name": name, "gstin": gstin, "state": state, "email": email},
            )

        revenue = GLAccount.objects.filter(tenant=tenant, account_number="400000").first()
        for code, name, hsn, price, slab_code in ITEMS:
            slab = TaxRateSlab.objects.filter(tenant=tenant, code=slab_code).first()
            Item.objects.update_or_create(
                tenant=tenant, code=code,
                defaults={"name": name, "hsn": hsn, "unit_price": Decimal(price),
                          "tax_slab": slab, "revenue_account": revenue},
            )

        self.stdout.write(self.style.SUCCESS(
            f"[OK] AR seeded for {tenant.name}: {Customer.objects.filter(tenant=tenant).count()} customers, "
            f"{Item.objects.filter(tenant=tenant).count()} items."
        ))
