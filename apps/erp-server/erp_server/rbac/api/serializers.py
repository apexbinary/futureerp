from rest_framework import serializers

from ..models import Page, Permission, Role, RoleMatrixEntry
from ...identity.models import User


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "key", "name", "description", "order"]


class PageSerializer(serializers.ModelSerializer):
    tabs = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = ["id", "key", "name", "module", "icon", "order", "is_active", "tabs"]

    def get_tabs(self, obj):
        return PageSerializer(obj.children.all(), many=True).data


class RoleSerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(source="users.count", read_only=True)

    class Meta:
        model = Role
        fields = ["id", "key", "name", "description", "is_system", "user_count", "created_at"]
        read_only_fields = ["id", "is_system", "user_count", "created_at"]


class RoleWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["name", "description"]

    def create(self, validated):
        from django.utils.text import slugify
        request = self.context["request"]
        tenant = getattr(request.user, "tenant", None)
        base = slugify(validated["name"])[:60] or "role"
        key = base
        i = 1
        while Role.objects.filter(tenant=tenant, key=key).exists():
            i += 1
            key = f"{base}-{i}"
        return Role.objects.create(tenant=tenant, key=key, **validated)


class MatrixEntrySerializer(serializers.Serializer):
    page = serializers.UUIDField()
    permission = serializers.UUIDField()
    allowed = serializers.BooleanField()


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "status", "is_tenant_owner", "roles"]

    def get_roles(self, obj):
        return [{"id": r.id, "name": r.name} for r in obj.roles.all()]


class UserWriteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(required=False, allow_blank=True)
    role_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    # optional: which SMTP config to send the invite from (overrides the module default)
    smtp_id = serializers.UUIDField(required=False, allow_null=True)
