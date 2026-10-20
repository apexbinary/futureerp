"""
Payments — customer receipts (money in) and vendor payments (money out).

On post, a Payment generates a balanced 2-line G/L document:
  • Receipt (customer): Dr Bank                Cr Trade Receivables
  • Payment (vendor):   Dr Trade Payables       Cr Bank

Optionally linked to a specific invoice/bill for reference (allocation/aging is a
future enhancement). Tenant-scoped.
"""
import uuid

from django.db import models

from erp_server.common.archive import ArchivableModel


class Payment(ArchivableModel):
    class Direction(models.TextChoices):
        RECEIPT = "receipt", "Customer Receipt"   # money in
        PAYMENT = "payment", "Vendor Payment"     # money out

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="payments")
    company_code = models.ForeignKey("finance.CompanyCode", on_delete=models.PROTECT, related_name="payments")
    direction = models.CharField(max_length=8, choices=Direction.choices)

    customer = models.ForeignKey("ar.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="payments")
    vendor = models.ForeignKey("ap.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="payments")

    payment_number = models.CharField(max_length=20, blank=True)
    payment_date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    bank_account = models.ForeignKey("finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    reference = models.CharField(max_length=64, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    # optional links for reference
    invoice = models.ForeignKey("ar.CustomerInvoice", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    bill = models.ForeignKey("ap.VendorBill", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")

    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    journal_entry = models.ForeignKey("finance.JournalEntry", null=True, blank=True, on_delete=models.SET_NULL, related_name="source_payments")
    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pay_payment"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.payment_number or f"(draft {self.id})"

    @property
    def party_name(self) -> str:
        if self.direction == self.Direction.RECEIPT and self.customer_id:
            return self.customer.name
        if self.direction == self.Direction.PAYMENT and self.vendor_id:
            return self.vendor.name
        return ""


class PaymentAllocation(models.Model):
    """Allocates part of a payment to a specific invoice/bill (open-item clearing).
    One payment can allocate across many documents (split settlement)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="payment_allocations")
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="allocations")
    invoice = models.ForeignKey("ar.CustomerInvoice", null=True, blank=True, on_delete=models.CASCADE, related_name="allocations")
    bill = models.ForeignKey("ap.VendorBill", null=True, blank=True, on_delete=models.CASCADE, related_name="allocations")
    amount = models.DecimalField(max_digits=18, decimal_places=2)

    class Meta:
        db_table = "pay_allocation"
        ordering = ["payment"]

    def __str__(self) -> str:
        return f"{self.amount} → {self.invoice_id or self.bill_id}"
