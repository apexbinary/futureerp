"""
Controlling (CO) — Cost Centers (SAP CO-CCA).

A Cost Center is a "where did it cost" dimension. Journal lines can be tagged with a
cost center (the Universal Journal dimension), and CO reports group spend by center.
"""
import uuid

from django.db import models

from erp_server.common.archive import ArchivableModel


class CostCenter(ArchivableModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="cost_centers")
    code = models.CharField(max_length=16)        # "CC-100"
    name = models.CharField(max_length=96)         # "Sales & Marketing"
    manager = models.CharField(max_length=96, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "co_cost_center"
        ordering = ["code"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class ProfitCenter(ArchivableModel):
    """A 'where profit is earned' dimension (SAP CO-PCA). Tags journal lines."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="profit_centers")
    code = models.CharField(max_length=16)        # "PC-100"
    name = models.CharField(max_length=96)         # "Retail Division"
    manager = models.CharField(max_length=96, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "co_profit_center"
        ordering = ["code"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"
