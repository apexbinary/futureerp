"""
Dynamic Tax Engine — Option B (SAP style), fully user-configurable + archivable.

Hierarchy:
  TaxRegime (the tax SYSTEM, e.g. "India GST")
    ├─ TaxLocation   (place-of-supply region: Intra / Inter — seeded, extensible)
    ├─ TaxComponent  (CGST / SGST / IGST + its G/L accounts)
    └─ TaxRateSlab   (rate band: GST 5 / 12 / 18 / 28)
         └─ TaxRate  (slab × location × component × percentage)  ← the %s live HERE

Everything except the TaxRate mapping cell is CRUD + Archive (ARC/UARC). Seeded
intra/inter locations are is_system (can't be archived/deleted). FKs into finance
are by string. All tenant-scoped.
"""
import uuid

from django.db import models

from erp_server.common.archive import ArchivableModel


class TaxRegime(ArchivableModel):
    """A country's tax system, e.g. 'India GST'. SAP ≈ Tax Procedure (TAXINN)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="tax_regimes")
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=96)
    country = models.CharField(max_length=2, default="IN")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tax_regime"
        ordering = ["name"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return self.name


class TaxLocation(ArchivableModel):
    """A place-of-supply region within a regime (Intra-state / Inter-state).
    Seeded intra/inter are is_system; users can add more. SAP: part of tax-code key."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="tax_locations")
    regime = models.ForeignKey(TaxRegime, on_delete=models.CASCADE, related_name="locations")
    code = models.CharField(max_length=16)          # "intra", "inter"
    name = models.CharField(max_length=64)          # "Intra-state", "Inter-state"
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "tax_location"
        ordering = ["regime", "sequence", "code"]
        unique_together = [("regime", "code")]

    def __str__(self) -> str:
        return self.name


class TaxComponent(ArchivableModel):
    """An atomic tax (CGST/SGST/IGST). SAP ≈ Condition Type + Account Key."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="tax_components")
    regime = models.ForeignKey(TaxRegime, on_delete=models.CASCADE, related_name="components")
    code = models.CharField(max_length=12)
    name = models.CharField(max_length=64)
    output_account = models.ForeignKey(
        "finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="tax_output_components",
    )
    input_account = models.ForeignKey(
        "finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="tax_input_components",
    )
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "tax_component"
        ordering = ["regime", "sequence", "code"]
        unique_together = [("regime", "code")]

    def __str__(self) -> str:
        return self.code


class TaxRateSlab(ArchivableModel):
    """A rate band, e.g. 'GST 18%'. A product's HSN maps to a slab."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="tax_slabs")
    regime = models.ForeignKey(TaxRegime, on_delete=models.CASCADE, related_name="slabs")
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=48)
    total_rate = models.DecimalField(max_digits=6, decimal_places=2)
    is_active = models.BooleanField(default=True)
    sequence = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "tax_rate_slab"
        ordering = ["regime", "sequence", "total_rate"]
        unique_together = [("regime", "code")]

    def __str__(self) -> str:
        return self.name


class TaxRate(models.Model):
    """The ACTUAL percentage — one row per (slab, location, component). SAP ≈ Condition Record.
    Not individually archivable; lifecycle follows its parent slab/regime."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="tax_rates")
    slab = models.ForeignKey(TaxRateSlab, on_delete=models.CASCADE, related_name="rates")
    location = models.ForeignKey(TaxLocation, null=True, blank=True, on_delete=models.CASCADE, related_name="rates")
    component = models.ForeignKey(TaxComponent, on_delete=models.CASCADE, related_name="rates")
    percentage = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        db_table = "tax_rate"
        ordering = ["slab", "location", "component"]
        unique_together = [("slab", "location", "component")]

    def __str__(self) -> str:
        loc = self.location.code if self.location else "?"
        return f"{self.slab.code}/{loc}/{self.component.code}={self.percentage}%"
