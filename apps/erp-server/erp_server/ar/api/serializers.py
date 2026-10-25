from rest_framework import serializers

from erp_server.common.payment_terms import due_date_from_terms
from erp_server.common.validators import validate_unique_code
from erp_server.finance.models import CompanyCode
from erp_server.tax.service import compute_tax, determine_region

from ..models import (
    CreditNote,
    CreditNoteLine,
    CreditNoteLineTax,
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

    def validate_code(self, value):
        tenant = self.context["request"].user.tenant
        return validate_unique_code(Customer, tenant, value, self.instance)


class ItemSerializer(serializers.ModelSerializer):
    tax_slab_name = serializers.CharField(source="tax_slab.name", read_only=True, default=None)

    class Meta:
        model = Item
        fields = ["id", "code", "name", "hsn", "unit_price", "tax_slab", "tax_slab_name",
                  "revenue_account", "created_at", *ARCHIVE_FIELDS]
        read_only_fields = ["id", "created_at", "archived_at", "is_system"]

    def validate_code(self, value):
        tenant = self.context["request"].user.tenant
        return validate_unique_code(Item, tenant, value, self.instance)


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
        if not validated.get("due_date"):
            due = due_date_from_terms(validated.get("baseline_date"), validated.get("payment_terms"))
            if due:
                validated["due_date"] = due
        inv = CustomerInvoice.objects.create(tenant=tenant, **validated)
        # Compute tax at entry time (same engine post_invoice uses) so a draft already
        # shows real tax — posting later recomputes fresh in case anything changed.
        region = determine_region(inv.company_code.state, inv.customer.state)
        for idx, ln in enumerate(lines, start=1):
            item = ln.get("item")
            slab = ln.get("tax_slab") or (item.tax_slab if item else None)
            line = CustomerInvoiceLine.objects.create(
                tenant=tenant, invoice=inv, line_number=ln.get("line_number", idx),
                item=item, description=ln.get("description", ""),
                quantity=ln.get("quantity", 1), unit_price=ln.get("unit_price", 0),
                tax_slab=slab,
            )
            if slab:
                for tl in compute_tax(slab, region, line.amount):
                    CustomerInvoiceLineTax.objects.create(
                        tenant=tenant, line=line, component_id=tl.component_id,
                        percentage=tl.percentage, amount=tl.amount,
                    )
        return inv


class CreditNoteLineTaxSerializer(serializers.ModelSerializer):
    component_code = serializers.CharField(source="component.code", read_only=True)

    class Meta:
        model = CreditNoteLineTax
        fields = ["id", "component", "component_code", "percentage", "amount"]
        read_only_fields = fields


class CreditNoteLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True, default=None)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    taxes = CreditNoteLineTaxSerializer(many=True, read_only=True)
    line_number = serializers.IntegerField(required=False)

    class Meta:
        model = CreditNoteLine
        fields = ["id", "line_number", "item", "item_name", "description",
                  "quantity", "unit_price", "tax_slab", "amount", "taxes"]
        read_only_fields = ["id", "amount", "taxes"]


class CreditNoteSerializer(serializers.ModelSerializer):
    lines = CreditNoteLineSerializer(many=True)
    # Derived from `invoice` in create() if omitted — the client only needs to pick an invoice.
    company_code = serializers.PrimaryKeyRelatedField(read_only=False, required=False, queryset=CompanyCode.objects.all())
    customer = serializers.PrimaryKeyRelatedField(read_only=False, required=False, queryset=Customer.objects.all())
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    subtotal = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    tax_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    grand_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    journal_document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)

    class Meta:
        model = CreditNote
        fields = ["id", "company_code", "customer", "customer_name", "invoice", "invoice_number",
                  "credit_note_number", "note_date", "reason", "currency", "status",
                  "subtotal", "tax_total", "grand_total",
                  "journal_entry", "journal_document", "lines", "created_at", "posted_at"]
        read_only_fields = ["id", "credit_note_number", "status", "currency", "subtotal", "tax_total", "grand_total",
                            "journal_entry", "journal_document", "created_at", "posted_at"]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("Add at least one line.")
        return lines

    def validate(self, attrs):
        invoice = attrs.get("invoice") or getattr(self.instance, "invoice", None)
        customer = attrs.get("customer") or getattr(self.instance, "customer", None)
        if invoice and customer and invoice.customer_id != customer.id:
            raise serializers.ValidationError("That invoice does not belong to this customer.")
        return attrs

    def create(self, validated):
        lines = validated.pop("lines")
        tenant = self.context["request"].user.tenant
        validated.setdefault("company_code", validated["invoice"].company_code)
        validated.setdefault("customer", validated["invoice"].customer)
        validated["currency"] = validated["invoice"].currency  # always follows the invoice, not independently settable
        note = CreditNote.objects.create(tenant=tenant, **validated)
        region = determine_region(note.company_code.state, note.customer.state)
        for idx, ln in enumerate(lines, start=1):
            item = ln.get("item")
            slab = ln.get("tax_slab") or (item.tax_slab if item else None)
            line = CreditNoteLine.objects.create(
                tenant=tenant, credit_note=note, line_number=ln.get("line_number", idx),
                item=item, description=ln.get("description", ""),
                quantity=ln.get("quantity", 1), unit_price=ln.get("unit_price", 0),
                tax_slab=slab,
            )
            if slab:
                for tl in compute_tax(slab, region, line.amount):
                    CreditNoteLineTax.objects.create(
                        tenant=tenant, line=line, component_id=tl.component_id,
                        percentage=tl.percentage, amount=tl.amount,
                    )
        return note
