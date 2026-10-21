from rest_framework import serializers

from ..models import (
    Customer,
    CustomerInvoice,
    CustomerInvoiceLine,
    CustomerInvoiceLineTax,
    Item,
)


ARCHIVE_FIELDS = ["is_archived", "archived_at", "is_system"]


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "code", "name", "gstin", "state", "email", "payment_terms",
                  "receivable_account", "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]


class ItemSerializer(serializers.ModelSerializer):
    tax_slab_name = serializers.CharField(source="tax_slab.name", read_only=True, default=None)

    class Meta:
        model = Item
        fields = ["id", "code", "name", "hsn", "unit_price", "tax_slab", "tax_slab_name",
                  "revenue_account", "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]


class LineTaxSerializer(serializers.ModelSerializer):
    component_code = serializers.CharField(source="component.code", read_only=True)

    class Meta:
        model = CustomerInvoiceLineTax
        fields = ["id", "component", "component_code", "percentage", "amount"]
        read_only_fields = fields


class InvoiceLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True, default=None)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    taxes = LineTaxSerializer(many=True, read_only=True)
    line_number = serializers.IntegerField(required=False)

    class Meta:
        model = CustomerInvoiceLine
        fields = ["id", "line_number", "item", "item_name", "description",
                  "quantity", "unit_price", "tax_slab", "amount", "taxes"]
        read_only_fields = ["id", "amount", "taxes"]


class CustomerInvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    subtotal = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    tax_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    grand_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    paid_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    outstanding = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    settlement_status = serializers.CharField(read_only=True)
    journal_document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)

    class Meta:
        model = CustomerInvoice
        fields = ["id", "company_code", "customer", "customer_name", "invoice_number",
                  "invoice_date", "baseline_date", "due_date", "payment_terms",
                  "currency", "notes", "status",
                  "subtotal", "tax_total", "grand_total", "paid_amount", "outstanding",
                  "settlement_status", "journal_entry", "journal_document",
                  "lines", "created_at", "posted_at"]
        read_only_fields = ["id", "invoice_number", "status", "subtotal", "tax_total",
                            "grand_total", "paid_amount", "outstanding", "settlement_status",
                            "journal_entry", "journal_document", "created_at", "posted_at"]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("Add at least one line.")
        return lines

    def create(self, validated):
        lines = validated.pop("lines")
        tenant = self.context["request"].user.tenant
        # SAP defaults: baseline date from invoice date; payment terms from the customer.
        validated.setdefault("baseline_date", validated.get("invoice_date"))
        if not validated.get("baseline_date"):
            validated["baseline_date"] = validated.get("invoice_date")
        if not validated.get("payment_terms") and validated.get("customer"):
            validated["payment_terms"] = validated["customer"].payment_terms
        inv = CustomerInvoice.objects.create(tenant=tenant, **validated)
        for idx, ln in enumerate(lines, start=1):
            CustomerInvoiceLine.objects.create(
                tenant=tenant, invoice=inv, line_number=ln.get("line_number", idx),
                item=ln.get("item"), description=ln.get("description", ""),
                quantity=ln.get("quantity", 1), unit_price=ln.get("unit_price", 0),
                tax_slab=ln.get("tax_slab") or (ln["item"].tax_slab if ln.get("item") else None),
            )
        return inv
