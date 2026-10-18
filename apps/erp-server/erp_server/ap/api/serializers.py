from rest_framework import serializers

from ..models import Vendor, VendorBill, VendorBillLine, VendorBillLineTax

ARCHIVE_FIELDS = ["is_archived", "archived_at", "is_system"]


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = ["id", "code", "name", "gstin", "state", "email", "payable_account",
                  "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]


class LineTaxSerializer(serializers.ModelSerializer):
    component_code = serializers.CharField(source="component.code", read_only=True)

    class Meta:
        model = VendorBillLineTax
        fields = ["id", "component", "component_code", "percentage", "amount"]
        read_only_fields = fields


class BillLineSerializer(serializers.ModelSerializer):
    expense_account_number = serializers.CharField(source="expense_account.account_number", read_only=True, default=None)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    taxes = LineTaxSerializer(many=True, read_only=True)
    line_number = serializers.IntegerField(required=False)

    class Meta:
        model = VendorBillLine
        fields = ["id", "line_number", "description", "expense_account", "expense_account_number",
                  "quantity", "unit_price", "tax_slab", "amount", "taxes"]
        read_only_fields = ["id", "amount", "taxes"]


class VendorBillSerializer(serializers.ModelSerializer):
    lines = BillLineSerializer(many=True)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    subtotal = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    tax_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    grand_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    journal_document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)

    class Meta:
        model = VendorBill
        fields = ["id", "company_code", "vendor", "vendor_name", "bill_number", "vendor_ref",
                  "bill_date", "due_date", "currency", "notes", "status",
                  "subtotal", "tax_total", "grand_total", "journal_entry", "journal_document",
                  "lines", "created_at", "posted_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "bill_number", "status", "subtotal", "tax_total", "grand_total",
                            "journal_entry", "journal_document", "created_at", "posted_at",
                            "archived_at", "is_system"]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("Add at least one line.")
        return lines

    def create(self, validated):
        lines = validated.pop("lines")
        tenant = self.context["request"].user.tenant
        bill = VendorBill.objects.create(tenant=tenant, **validated)
        for idx, ln in enumerate(lines, start=1):
            VendorBillLine.objects.create(
                tenant=tenant, bill=bill, line_number=ln.get("line_number", idx),
                description=ln.get("description", ""), expense_account=ln.get("expense_account"),
                quantity=ln.get("quantity", 1), unit_price=ln.get("unit_price", 0),
                tax_slab=ln.get("tax_slab"),
            )
        return bill
