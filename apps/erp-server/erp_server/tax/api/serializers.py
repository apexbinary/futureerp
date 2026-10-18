from rest_framework import serializers

from ..models import TaxComponent, TaxLocation, TaxRate, TaxRateSlab, TaxRegime

ARCHIVE_FIELDS = ["is_archived", "archived_at", "is_system"]


class TaxRegimeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRegime
        fields = ["id", "code", "name", "country", "is_active", "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]


class TaxLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxLocation
        fields = ["id", "regime", "code", "name", "sequence", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "archived_at", "is_system"]


class TaxComponentSerializer(serializers.ModelSerializer):
    output_account_number = serializers.CharField(source="output_account.account_number", read_only=True, default=None)
    input_account_number = serializers.CharField(source="input_account.account_number", read_only=True, default=None)

    class Meta:
        model = TaxComponent
        fields = ["id", "regime", "code", "name", "sequence",
                  "output_account", "output_account_number",
                  "input_account", "input_account_number", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "archived_at", "is_system"]


class TaxRateSlabSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRateSlab
        fields = ["id", "regime", "code", "name", "total_rate", "is_active", "sequence", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "archived_at", "is_system"]


class TaxRateSerializer(serializers.ModelSerializer):
    component_code = serializers.CharField(source="component.code", read_only=True)
    location_code = serializers.CharField(source="location.code", read_only=True)

    class Meta:
        model = TaxRate
        fields = ["id", "slab", "location", "location_code", "component", "component_code", "percentage"]
        read_only_fields = ["id"]
