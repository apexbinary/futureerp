from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Tenant, User


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "deployment_type", "status", "plan"]
    list_filter = ["deployment_type", "status"]
    search_fields = ["name", "code"]


@admin.register(User)
class UserAdminConfig(UserAdmin):
    ordering = ["email"]
    list_display = ["email", "full_name", "tenant", "role", "status", "is_active"]
    list_filter = ["role", "status", "is_active", "tenant"]
    search_fields = ["email", "full_name"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("full_name", "tenant", "role", "status", "is_tenant_owner")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Timestamps", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    readonly_fields = ["created_at", "updated_at", "last_login"]
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "full_name", "tenant", "role", "password1", "password2")}),
    )
