"""
Shared DRF permission: a request must belong to a workspace (tenant) to touch
tenant-scoped data. This is the single guard that prevents cross-tenant / tenant-less
access — apply it to every tenant-scoped view.
"""
from rest_framework.permissions import BasePermission


class HasTenant(BasePermission):
    message = "This account isn't part of a workspace."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and getattr(request.user, "tenant_id", None))
