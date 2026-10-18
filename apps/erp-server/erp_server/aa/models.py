"""
Asset Accounting (AA) — fixed assets + straight-line depreciation (SAP FI-AA).

A FixedAsset has an acquisition cost and useful life. Running depreciation for a
period posts: Dr Depreciation Expense  Cr Accumulated Depreciation, and records a
DepreciationEntry. Net book value = cost − accumulated depreciation.
"""
import uuid
from decimal import Decimal

from django.db import models

from erp_server.common.archive import ArchivableModel

ZERO = Decimal("0.00")


class FixedAsset(ArchivableModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        DISPOSED = "disposed", "Disposed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="fixed_assets")
    company_code = models.ForeignKey("finance.CompanyCode", on_delete=models.PROTECT, related_name="fixed_assets")
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=160)
    asset_class = models.CharField(max_length=64, blank=True)   # "Machinery", "IT Equipment"
    acquisition_date = models.DateField()
    acquisition_cost = models.DecimalField(max_digits=18, decimal_places=2)
    salvage_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    useful_life_years = models.PositiveIntegerField(default=5)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    # G/L accounts (defaults resolved in the service if left blank)
    asset_account = models.ForeignKey("finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="aa_asset")
    accum_dep_account = models.ForeignKey("finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="aa_accum")
    dep_expense_account = models.ForeignKey("finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="aa_expense")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "aa_fixed_asset"
        ordering = ["code"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"

    @property
    def depreciable_base(self) -> Decimal:
        return self.acquisition_cost - self.salvage_value

    @property
    def monthly_depreciation(self) -> Decimal:
        months = (self.useful_life_years or 1) * 12
        return (self.depreciable_base / months).quantize(Decimal("0.01"))

    @property
    def accumulated_depreciation(self) -> Decimal:
        return self.dep_entries.aggregate(s=models.Sum("amount"))["s"] or ZERO

    @property
    def net_book_value(self) -> Decimal:
        return self.acquisition_cost - self.accumulated_depreciation


class DepreciationEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="aa_dep_entries")
    asset = models.ForeignKey(FixedAsset, on_delete=models.CASCADE, related_name="dep_entries")
    period = models.CharField(max_length=7)   # "YYYY-MM"
    period_date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    journal_entry = models.ForeignKey("finance.JournalEntry", null=True, blank=True, on_delete=models.SET_NULL, related_name="dep_entries")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "aa_depreciation_entry"
        ordering = ["asset", "period"]
        unique_together = [("asset", "period")]
