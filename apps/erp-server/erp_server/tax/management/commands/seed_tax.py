"""
Seed India GST tax configuration for a tenant:
  • regime "India GST"
  • locations Intra / Inter (is_system)
  • components CGST / SGST / IGST (wired to G/L accounts)
  • slabs GST 5 / 12 / 18 / 28
  • rates: intra → CGST+SGST (half each); inter → IGST (full)

Requires seed_finance first. Idempotent.
Usage: manage.py seed_tax --tenant abc
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from erp_server.finance.models import GLAccount
from erp_server.identity.models import Tenant
from erp_server.tax.models import (
    TaxComponent,
    TaxLocation,
    TaxRate,
    TaxRateSlab,
    TaxRegime,
)

LOCATIONS = [("intra", "Intra-state", 1), ("inter", "Inter-state", 2)]
COMPONENTS = {
    "CGST": ("Central GST", "210000", "120000", 1),
    "SGST": ("State GST", "210100", "120100", 2),
    "IGST": ("Integrated GST", "210200", "120200", 3),
}
SLABS = [("GST5", "GST 5%", 5), ("GST12", "GST 12%", 12), ("GST18", "GST 18%", 18), ("GST28", "GST 28%", 28)]


class Command(BaseCommand):
    help = "Seed India GST tax configuration for a tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")

        def acct(num):
            return GLAccount.objects.filter(tenant=tenant, account_number=num).first()

        regime, _ = TaxRegime.objects.get_or_create(
            tenant=tenant, code="IN_GST",
            defaults={"name": "India GST", "country": "IN", "is_system": True},
        )

        locs = {}
        for code, name, seq in LOCATIONS:
            loc, _ = TaxLocation.objects.update_or_create(
                regime=regime, code=code,
                defaults={"tenant": tenant, "name": name, "sequence": seq, "is_system": True},
            )
            locs[code] = loc

        comps = {}
        for code, (name, out_num, in_num, seq) in COMPONENTS.items():
            c, _ = TaxComponent.objects.update_or_create(
                regime=regime, code=code,
                defaults={"tenant": tenant, "name": name, "sequence": seq,
                          "output_account": acct(out_num), "input_account": acct(in_num)},
            )
            comps[code] = c

        slabs = {}
        for i, (code, name, rate) in enumerate(SLABS):
            s, _ = TaxRateSlab.objects.update_or_create(
                regime=regime, code=code,
                defaults={"tenant": tenant, "name": name, "total_rate": Decimal(rate), "sequence": i},
            )
            slabs[code] = (s, Decimal(rate))

        for code, (slab, rate) in slabs.items():
            half = (rate / 2).quantize(Decimal("0.01"))
            mappings = [
                (comps["CGST"], locs["intra"], half),
                (comps["SGST"], locs["intra"], half),
                (comps["IGST"], locs["inter"], rate),
            ]
            for comp, loc, pct in mappings:
                TaxRate.objects.update_or_create(
                    tenant=tenant, slab=slab, location=loc, component=comp,
                    defaults={"percentage": pct},
                )

        self.stdout.write(self.style.SUCCESS(
            f"[OK] Tax seeded for {tenant.name}: regime {regime.code}, {len(locs)} locations, "
            f"{len(comps)} components, {len(slabs)} slabs, {TaxRate.objects.filter(tenant=tenant).count()} rate rows."
        ))
