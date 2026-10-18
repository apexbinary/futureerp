"""
Entitlements (node side) — WHICH modules/features a tenant has licensed.

In the full architecture these are issued by the control-plane's licensing engine and
delivered via the signed license file; here the node stores and enforces them. This is
the business-level gate: "did the company pay for this feature?" (RBAC is the separate
user-level gate).
"""
import uuid

from django.db import models


class Entitlement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="entitlements")
    key = models.SlugField(max_length=64)       # "finance.gl", "finance.ar", ...
    name = models.CharField(max_length=96, blank=True)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ent_entitlement"
        ordering = ["key"]
        unique_together = [("tenant", "key")]

    def __str__(self) -> str:
        return f"{self.key}={'on' if self.enabled else 'off'}"
