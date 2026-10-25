from rest_framework import serializers

from erp_server.common.payment_terms import due_date_from_terms
from erp_server.common.validators import validate_unique_code
from erp_server.finance.models import CompanyCode
from erp_server.tax.service import compute_tax, determine_region

from ..models import DebitNote, DebitNoteLine, DebitNoteLineTax, Vendor, VendorBill, VendorBillLine, VendorBillLineTax

ARCHIVE_FIELDS = ["is_archived", "archived_at", "is_system"]


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = ["id", "code", "name", "gstin", "state", "email", "payment_terms",
                  "payable_account", "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]

    def validate_code(self, value):
        tenant = self.context["request"].user.tenant
        return validate_unique_code(Vendor, tenant, value, self.instance)


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
    paid_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    outstanding = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    settlement_status = serializers.CharField(read_only=True)
    journal_document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)

    class Meta:
        model = VendorBill
        fields = ["id", "company_code", "vendor", "vendor_name", "bill_number", "vendor_ref",
                  "bill_date", "baseline_date", "due_date", "payment_terms",
                  "currency", "notes", "status",
                  "subtotal", "tax_total", "grand_total", "paid_amount", "outstanding",
                  "settlement_status", "journal_entry", "journal_document",
                  "lines", "created_at", "posted_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "bill_number", "status", "subtotal", "tax_total", "grand_total",
                            "paid_amount", "outstanding", "settlement_status",
                            "journal_entry", "journal_document", "created_at", "posted_at",
                            "archived_at", "is_system"]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("Add at least one line.")
        return lines

    def create(self, validated):
        lines = validated.pop("lines")
        tenant = self.context["request"].user.tenant
        if not validated.get("baseline_date"):
            validated["baseline_date"] = validated.get("bill_date")
        if not validated.get("payment_terms") and validated.get("vendor"):
            validated["payment_terms"] = validated["vendor"].payment_terms
        if not validated.get("due_date"):
            due = due_date_from_terms(validated.get("baseline_date"), validated.get("payment_terms"))
            if due:
                validated["due_date"] = due
        bill = VendorBill.objects.create(tenant=tenant, **validated)
        # Compute tax at entry time (same engine post_bill uses) so a draft already
        # shows real tax — posting later recomputes fresh in case anything changed.
        region = determine_region(bill.company_code.state, bill.vendor.state)
        for idx, ln in enumerate(lines, start=1):
            slab = ln.get("tax_slab")
            line = VendorBillLine.objects.create(
                tenant=tenant, bill=bill, line_number=ln.get("line_number", idx),
                description=ln.get("description", ""), expense_account=ln.get("expense_account"),
                quantity=ln.get("quantity", 1), unit_price=ln.get("unit_price", 0),
                tax_slab=slab,
            )
            if slab:
                for tl in compute_tax(slab, region, line.amount):
                    VendorBillLineTax.objects.create(
                        tenant=tenant, line=line, component_id=tl.component_id,
                        percentage=tl.percentage, amount=tl.amount,
                    )
        return bill


class DebitNoteLineTaxSerializer(serializers.ModelSerializer):
    component_code = serializers.CharField(source="component.code", read_only=True)

    class Meta:
        model = DebitNoteLineTax
        fields = ["id", "component", "component_code", "percentage", "amount"]
        read_only_fields = fields


class DebitNoteLineSerializer(serializers.ModelSerializer):
    expense_account_number = serializers.CharField(source="expense_account.account_number", read_only=True, default=None)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    taxes = DebitNoteLineTaxSerializer(many=True, read_only=True)
    line_number = serializers.IntegerField(required=False)

    class Meta:
        model = DebitNoteLine
        fields = ["id", "line_number", "description", "expense_account", "expense_account_number",
                  "quantity", "unit_price", "tax_slab", "amount", "taxes"]
        read_only_fields = ["id", "amount", "taxes"]


class DebitNoteSerializer(serializers.ModelSerializer):
    lines = DebitNoteLineSerializer(many=True)
    # Derived from `bill` in create() if omitted — the client only needs to pick a bill.
    company_code = serializers.PrimaryKeyRelatedField(read_only=False, required=False, queryset=CompanyCode.objects.all())
    vendor = serializers.PrimaryKeyRelatedField(read_only=False, required=False, queryset=Vendor.objects.all())
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    bill_number = serializers.CharField(source="bill.bill_number", read_only=True)
    subtotal = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    tax_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    grand_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    journal_document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)

    class Meta:
        model = DebitNote
        fields = ["id", "company_code", "vendor", "vendor_name", "bill", "bill_number",
                  "debit_note_number", "note_date", "reason", "currency", "status",
                  "subtotal", "tax_total", "grand_total",
                  "journal_entry", "journal_document", "lines", "created_at", "posted_at"]
        read_only_fields = ["id", "debit_note_number", "status", "currency", "subtotal", "tax_total", "grand_total",
                            "journal_entry", "journal_document", "created_at", "posted_at"]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("Add at least one line.")
        return lines

    def validate(self, attrs):
        bill = attrs.get("bill") or getattr(self.instance, "bill", None)
        vendor = attrs.get("vendor") or getattr(self.instance, "vendor", None)
        if bill and vendor and bill.vendor_id != vendor.id:
            raise serializers.ValidationError("That bill does not belong to this vendor.")
        return attrs

    def create(self, validated):
        lines = validated.pop("lines")
        tenant = self.context["request"].user.tenant
        validated.setdefault("company_code", validated["bill"].company_code)
        validated.setdefault("vendor", validated["bill"].vendor)
        validated["currency"] = validated["bill"].currency  # always follows the bill, not independently settable
        note = DebitNote.objects.create(tenant=tenant, **validated)
        region = determine_region(note.company_code.state, note.vendor.state)
        for idx, ln in enumerate(lines, start=1):
            slab = ln.get("tax_slab")
            line = DebitNoteLine.objects.create(
                tenant=tenant, debit_note=note, line_number=ln.get("line_number", idx),
                description=ln.get("description", ""), expense_account=ln.get("expense_account"),
                quantity=ln.get("quantity", 1), unit_price=ln.get("unit_price", 0),
                tax_slab=slab,
            )
            if slab:
                for tl in compute_tax(slab, region, line.amount):
                    DebitNoteLineTax.objects.create(
                        tenant=tenant, line=line, component_id=tl.component_id,
                        percentage=tl.percentage, amount=tl.amount,
                    )
        return note
