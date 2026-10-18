"""
Tenant-side identity — the tenants and the people who use the ERP.
These live on the NODE (erp-server), so a self-hosted install authenticates locally/offline.
Email is the login. For now email is unique across the node; per-tenant email + subdomain
resolution can layer on later.
"""
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Tenant(models.Model):
    class Deployment(models.TextChoices):
        CLOUD = "cloud", "Cloud"
        SELF_HOSTED = "self_hosted", "Self-hosted"

    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        CANCELLED = "cancelled", "Cancelled"

    # Same UUID as the control-plane tenant record (the shared join key).
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.SlugField(max_length=64, unique=True)
    deployment_type = models.CharField(max_length=20, choices=Deployment.choices, default=Deployment.CLOUD)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    plan = models.CharField(max_length=64, blank=True)
    region = models.CharField(max_length=64, blank=True)
    license_valid_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenant"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class UserManager(BaseUserManager):
    def create_user(self, email: str, password: str | None = None, tenant: "Tenant | None" = None, **extra):
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email), tenant=tenant, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra):
        # Platform/staff account for the node itself (no tenant) — e.g. gated Swagger login.
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        extra.setdefault("status", User.Status.ACTIVE)
        return self.create_user(email, password, tenant=None, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        CLIENT_ADMIN = "client_admin", "Client admin"
        MANAGER = "manager", "Manager"
        ACCOUNTANT = "accountant", "Accountant"
        STAFF = "staff", "Staff"
        VIEWER = "viewer", "Viewer"

    class Status(models.TextChoices):
        INVITED = "invited", "Invited"
        ACTIVE = "active", "Active"
        DISABLED = "disabled", "Disabled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, null=True, blank=True, on_delete=models.CASCADE, related_name="users"
    )
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    # Interim single-role field; the dynamic RBAC (Role/Membership) replaces this next.
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    is_tenant_owner = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        db_table = "erp_user"
        ordering = ["email"]

    def __str__(self) -> str:
        return self.email
