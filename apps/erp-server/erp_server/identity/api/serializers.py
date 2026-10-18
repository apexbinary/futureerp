from rest_framework import serializers

from ..models import Tenant, User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(style={"input_type": "password"}, trim_whitespace=False)


class TenantMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "code", "plan", "status", "deployment_type"]


class UserSerializer(serializers.ModelSerializer):
    tenant = TenantMiniSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "is_tenant_owner", "status", "tenant"]
