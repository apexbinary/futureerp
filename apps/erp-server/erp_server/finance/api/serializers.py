from rest_framework import serializers

from ..models import (
    ChartOfAccounts,
    CompanyCode,
    ExchangeRate,
    FiscalYear,
    GLAccount,
    JournalEntry,
    JournalEntryLine,
    PostingPeriod,
)


ARCHIVE_FIELDS = ["is_archived", "archived_at", "is_system"]


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "currency", "rate_date", "rate_to_base", "created_at"]
        read_only_fields = ["id", "created_at"]


class ChartOfAccountsSerializer(serializers.ModelSerializer):
    account_count = serializers.IntegerField(source="accounts.count", read_only=True)

    class Meta:
        model = ChartOfAccounts
        fields = ["id", "code", "name", "description", "account_count", "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]


class GLAccountSerializer(serializers.ModelSerializer):
    chart_code = serializers.CharField(source="chart_of_accounts.code", read_only=True)

    class Meta:
        model = GLAccount
        fields = [
            "id", "chart_of_accounts", "chart_code", "account_number", "name",
            "account_type", "statement", "is_reconciliation", "blocked", "created_at",
            *ARCHIVE_FIELDS,
        ]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]


class CompanyCodeSerializer(serializers.ModelSerializer):
    chart_code = serializers.CharField(source="chart_of_accounts.code", read_only=True)

    class Meta:
        model = CompanyCode
        fields = [
            "id", "code", "name", "currency", "country", "state", "gstin",
            "chart_of_accounts", "chart_code", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PostingPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostingPeriod
        fields = ["id", "period", "start_date", "end_date", "is_open"]


class FiscalYearSerializer(serializers.ModelSerializer):
    periods = PostingPeriodSerializer(many=True, read_only=True)
    company_code_code = serializers.CharField(source="company_code.code", read_only=True)

    class Meta:
        model = FiscalYear
        fields = [
            "id", "company_code", "company_code_code", "year",
            "start_date", "end_date", "is_closed", "periods",
        ]
        read_only_fields = ["id"]


# ── Journal entry (document) ─────────────────────────────────────────────
class JournalEntryLineSerializer(serializers.ModelSerializer):
    account_number = serializers.CharField(source="gl_account.account_number", read_only=True)
    account_name = serializers.CharField(source="gl_account.name", read_only=True)
    cost_center_code = serializers.CharField(source="cost_center.code", read_only=True, default=None)
    cost_center_name = serializers.CharField(source="cost_center.name", read_only=True, default=None)
    profit_center_code = serializers.CharField(source="profit_center.code", read_only=True, default=None)
    profit_center_name = serializers.CharField(source="profit_center.name", read_only=True, default=None)
    # Auto-numbered on create when omitted.
    line_number = serializers.IntegerField(required=False)

    class Meta:
        model = JournalEntryLine
        fields = [
            "id", "line_number", "gl_account", "account_number", "account_name",
            "debit_credit", "posting_key", "amount", "line_text", "assignment",
            "cost_center", "cost_center_code", "cost_center_name",
            "profit_center", "profit_center_code", "profit_center_name",
            "business_area", "segment",
        ]
        read_only_fields = ["id", "posting_key"]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalEntryLineSerializer(many=True)
    total_debit = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    total_credit = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    is_balanced = serializers.BooleanField(read_only=True)
    company_code_code = serializers.CharField(source="company_code.code", read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            "id", "company_code", "company_code_code", "document_number", "fiscal_year",
            "document_type", "posting_date", "document_date", "currency", "exchange_rate", "reference",
            "header_text", "status", "reverses",
            "source_type", "source_id", "source_number",
            "party_type", "party_code", "party_name",
            "total_debit", "total_credit", "is_balanced",
            "lines", "created_at", "posted_at",
        ]
        read_only_fields = [
            "id", "document_number", "fiscal_year", "status", "reverses",
            "source_id", "source_number",
            "total_debit", "total_credit", "is_balanced", "created_at", "posted_at",
        ]

    def validate_lines(self, lines):
        if len(lines) < 2:
            raise serializers.ValidationError("A document needs at least two line items.")
        return lines

    def create(self, validated):
        lines = validated.pop("lines")
        tenant = self.context["request"].user.tenant
        user = self.context["request"].user
        entry = JournalEntry.objects.create(tenant=tenant, created_by=user, **validated)
        for idx, ln in enumerate(lines, start=1):
            JournalEntryLine.objects.create(
                tenant=tenant,
                journal_entry=entry,
                line_number=ln.get("line_number", idx),
                gl_account=ln["gl_account"],
                debit_credit=ln["debit_credit"],
                amount=ln["amount"],
                line_text=ln.get("line_text", ""),
                assignment=ln.get("assignment", ""),
                cost_center=ln.get("cost_center"),
                profit_center=ln.get("profit_center"),
                business_area=ln.get("business_area", ""),
                segment=ln.get("segment", ""),
            )
        return entry
