from rest_framework import serializers

from ..models import EmailModule, SmtpConfig, SmtpLog
from ..service import usage_count


class SmtpConfigSerializer(serializers.ModelSerializer):
    # password is write-only — never returned to the client
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    usage = serializers.SerializerMethodField()

    class Meta:
        model = SmtpConfig
        fields = [
            "id", "label", "sender_name", "sender_email", "host", "port", "username",
            "password", "use_tls", "use_ssl", "send_limit", "limit_period",
            "is_active", "usage", "created_at",
        ]
        read_only_fields = ["id", "usage", "created_at"]

    def get_usage(self, obj):
        return {"used": usage_count(obj), "limit": obj.send_limit, "period": obj.limit_period}

    def update(self, instance, validated):
        # keep existing password if not provided
        if not validated.get("password"):
            validated.pop("password", None)
        return super().update(instance, validated)


class EmailModuleSerializer(serializers.ModelSerializer):
    smtp_label = serializers.CharField(source="default_smtp.label", read_only=True, default=None)

    class Meta:
        model = EmailModule
        fields = ["id", "key", "name", "description", "default_smtp", "smtp_label"]
        read_only_fields = ["id", "key", "name", "description", "smtp_label"]


class SmtpLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmtpLog
        fields = ["id", "smtp_label", "module_key", "to_email", "subject", "status", "error", "created_at"]


class TestSendSerializer(serializers.Serializer):
    to_email = serializers.EmailField()
