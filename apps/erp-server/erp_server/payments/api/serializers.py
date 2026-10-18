from rest_framework import serializers

from ..models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    party_name = serializers.CharField(read_only=True)
    journal_document = serializers.CharField(source="journal_entry.document_number", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ["id", "company_code", "direction", "customer", "vendor", "party_name",
                  "payment_number", "payment_date", "amount", "bank_account", "reference", "notes",
                  "invoice", "bill", "status", "journal_entry", "journal_document",
                  "created_at", "posted_at", "is_archived", "archived_at", "is_system"]
        read_only_fields = ["id", "payment_number", "party_name", "status", "journal_entry",
                            "journal_document", "created_at", "posted_at", "archived_at", "is_system"]
