from rest_framework import serializers

from ..models import CostCenter


class CostCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCenter
        fields = ["id", "code", "name", "manager", "created_at",
                  "is_archived", "archived_at", "is_system"]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]
