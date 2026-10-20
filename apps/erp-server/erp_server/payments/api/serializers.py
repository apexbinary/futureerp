from decimal import Decimal

from rest_framework import serializers

from ..models import Payment, PaymentAllocation


class AllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentAllocation
        fields = ["id", "invoice", "bill", "amount"]
        read_only_fields = ["id"]


class PaymentSerializer(serializers.ModelSerializer):
    party_name = serializers.CharField(read_only=True)
    journal_document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)
    allocations = AllocationSerializer(many=True, required=False)

    class Meta:
        model = Payment
        fields = ["id", "company_code", "direction", "customer", "vendor", "party_name",
                  "payment_number", "payment_date", "amount", "bank_account", "reference", "notes",
                  "invoice", "bill", "allocations", "status", "journal_entry", "journal_document",
                  "created_at", "posted_at", "is_archived", "archived_at", "is_system"]
        read_only_fields = ["id", "payment_number", "party_name", "status", "journal_entry",
                            "journal_document", "created_at", "posted_at", "archived_at", "is_system"]

    def create(self, validated):
        allocations = validated.pop("allocations", [])
        tenant = self.context["request"].user.tenant
        payment = Payment.objects.create(tenant=tenant, **validated)
        # Explicit split allocations, else auto-allocate the whole amount to the single invoice/bill FK.
        if allocations:
            for a in allocations:
                if (a.get("amount") or 0) <= 0:
                    continue
                PaymentAllocation.objects.create(
                    tenant=tenant, payment=payment,
                    invoice=a.get("invoice"), bill=a.get("bill"), amount=a["amount"],
                )
        elif payment.invoice_id or payment.bill_id:
            PaymentAllocation.objects.create(
                tenant=tenant, payment=payment,
                invoice_id=payment.invoice_id, bill_id=payment.bill_id, amount=Decimal(str(payment.amount)),
            )
        return payment
