from rest_framework import serializers

from ..models import DepreciationEntry, FixedAsset

ARCHIVE_FIELDS = ["is_archived", "archived_at", "is_system"]


class FixedAssetSerializer(serializers.ModelSerializer):
    monthly_depreciation = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    accumulated_depreciation = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    net_book_value = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = FixedAsset
        fields = ["id", "company_code", "code", "name", "asset_class", "acquisition_date",
                  "acquisition_cost", "salvage_value", "useful_life_years", "status",
                  "asset_account", "accum_dep_account", "dep_expense_account",
                  "monthly_depreciation", "accumulated_depreciation", "net_book_value",
                  "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system",
                            "monthly_depreciation", "accumulated_depreciation", "net_book_value"]


class DepreciationEntrySerializer(serializers.ModelSerializer):
    asset_code = serializers.CharField(source="asset.code", read_only=True)
    document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)

    class Meta:
        model = DepreciationEntry
        fields = ["id", "asset", "asset_code", "period", "period_date", "amount", "document", "created_at"]
        read_only_fields = fields
