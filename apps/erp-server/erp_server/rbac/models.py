"""
Dynamic RBAC.

- Permission: the ACTION catalog (read/write/edit/delete/export/import/filter/approve).
  System-seeded. Users cannot create these.
- Page: a screen in the app; may have sub-resources (tabs) via self-FK `parent`.
  System-seeded. Users cannot create these.
- Role: user-created, per-tenant. (client_admin is a system role that can't be deleted.)
- RoleMatrixEntry: the permission matrix — one toggle per (role, page, permission).
- User.roles (M2M) assigns roles to users; effective permissions = union across roles.
"""
import uuid

from django.conf import settings
from django.db import models


class Permission(models.Model):
    """The action catalog. Seeded; not user-creatable."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.SlugField(max_length=32, unique=True)   # read, write, edit, delete, ...
    name = models.CharField(max_length=64)
    description = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "rbac_permission"
        ordering = ["order", "key"]

    def __str__(self) -> str:
        return self.name


class Page(models.Model):
    """A screen/resource. Sub-resources (tabs) are children via `parent`. Seeded; not user-creatable."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.SlugField(max_length=96, unique=True)   # finance.invoices, finance.invoices.drafts
    name = models.CharField(max_length=96)
    module = models.CharField(max_length=48)             # Finance, Sales, Admin, ...
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    icon = models.CharField(max_length=48, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "rbac_page"
        ordering = ["module", "order", "name"]

    def __str__(self) -> str:
        return f"{self.module} · {self.name}"

    @property
    def is_tab(self) -> bool:
        return self.parent_id is not None


class Role(models.Model):
    """User-created, per-tenant. is_system roles (e.g. client_admin) can't be deleted."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", null=True, blank=True, on_delete=models.CASCADE, related_name="roles"
    )
    key = models.SlugField(max_length=64)
    name = models.CharField(max_length=96)
    description = models.CharField(max_length=200, blank=True)
    is_system = models.BooleanField(default=False)
    users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="roles", blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rbac_role"
        ordering = ["name"]
        unique_together = [("tenant", "key")]

    def __str__(self) -> str:
        return self.name


class RoleMatrixEntry(models.Model):
    """One cell of the permission matrix: is `permission` allowed on `page` for `role`?"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="matrix")
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="matrix")
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="matrix")
    allowed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rbac_role_matrix"
        unique_together = [("role", "page", "permission")]

    def __str__(self) -> str:
        return f"{self.role.name}/{self.page.key}/{self.permission.key}={self.allowed}"
