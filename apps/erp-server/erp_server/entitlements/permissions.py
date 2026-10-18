"""
HasEntitlement — DRF permission that gates a view by the tenant's licensed features.

Set `required_entitlement = "finance.ar"` on a viewset and add HasEntitlement to its
permission_classes. Returns 403 with a clear message if the tenant isn't licensed.
"""
from rest_framework.permissions import BasePermission

from .models import Entitlement


class HasEntitlement(BasePermission):
    message = "Your plan does not include this feature."

    def has_permission(self, request, view) -> bool:
        key = getattr(view, "required_entitlement", None)
        if not key:
            return True
        tenant = getattr(request.user, "tenant", None)
        if not tenant:
            return False
        ok = Entitlement.objects.filter(tenant=tenant, key=key, enabled=True).exists()
        if not ok:
            self.message = f"Your plan does not include '{key}'."
        return ok
