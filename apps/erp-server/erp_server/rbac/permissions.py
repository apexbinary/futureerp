"""
Shared DRF permissions.

HasTenant — a request must belong to a workspace (tenant) to touch tenant-scoped
data. This is the single guard that prevents cross-tenant / tenant-less access —
apply it to every tenant-scoped view.

HasPagePermission — gates specific VIEWSET ACTIONS by the dynamic RBAC permission
matrix (Role → RoleMatrixEntry → Page/Permission). Most actions (list/create/edit)
are left to HasTenant/HasEntitlement; this is for actions that need a specific
permission KEY on a specific PAGE — e.g. requiring 'approve' to post a document.
"""
from rest_framework.permissions import BasePermission

from .models import RoleMatrixEntry


class HasTenant(BasePermission):
    message = "This account isn't part of a workspace."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and getattr(request.user, "tenant_id", None))


class HasPagePermission(BasePermission):
    """
    On a ViewSet, gate specific actions:
        page_key = "finance.invoices"
        action_permissions = {"post_invoice": "approve", "reverse_invoice": "approve"}
    Actions not listed in `action_permissions` are not gated by this class at all
    (returns True immediately) — it only ever narrows specific actions.

    On a plain APIView (no `.action` to key off), gate the whole view instead:
        page_key = "finance.payments"
        required_permission = "approve"
    """
    message = "You don't have permission to do that."

    def has_permission(self, request, view) -> bool:
        page_key = getattr(view, "page_key", None)
        perm_key = getattr(view, "required_permission", None)
        if perm_key is None:
            action_permissions = getattr(view, "action_permissions", None) or {}
            perm_key = action_permissions.get(getattr(view, "action", None))
        if not page_key or not perm_key:
            return True
        tenant = getattr(request.user, "tenant", None)
        if not tenant:
            return False
        ok = RoleMatrixEntry.objects.filter(
            role__tenant=tenant, role__users=request.user,
            page__key=page_key, permission__key=perm_key, allowed=True,
        ).exists()
        if not ok:
            self.message = f"You don't have '{perm_key}' access on this page."
        return ok
