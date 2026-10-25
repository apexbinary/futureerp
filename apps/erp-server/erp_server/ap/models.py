"""
Accounts Payable (AP) — the vendor subledger (SAP FI-AP). Mirror of AR.

A VendorBill, when POSTED, auto-computes INPUT tax and generates a balanced G/L doc:
    Dr  Expense / Inventory (per line)      line base
    Dr  Input tax (CGST/SGST or IGST)       per component
        Cr  Trade Payables (recon)          grand total (incl. tax)

Subledger → reconciliation account → General Ledger, SAP-faithful.
"""
import uuid

from django.db import models

from erp_server.common.archive import ArchivableModel


class Vendor(ArchivableModel):
    """A vendor (creditor). State is the GST place of supply."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="vendors")
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=160)
    gstin = models.CharField(max_length=20, blank=True)
    state = models.CharField(max_length=64, blank=True)
    email = models.EmailField(blank=True)
    payment_terms = models.CharField(max_length=32, blank=True)
    payable_account = models.ForeignKey(
        "finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="ap_vendors",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ap_vendor"
        ordering = ["name"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class VendorBill(ArchivableModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="vendor_bills")
    company_code = models.ForeignKey("finance.CompanyCode", on_delete=models.PROTECT, related_name="vendor_bills")
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="bills")
    bill_number = models.CharField(max_length=20, blank=True)
    vendor_ref = models.CharField(max_length=64, blank=True)   # vendor's own invoice no.
    bill_date = models.DateField()
    baseline_date = models.DateField(null=True, blank=True)   # SAP: baseline date for due/aging
    due_date = models.DateField(null=True, blank=True)
    payment_terms = models.CharField(max_length=32, blank=True)
    currency = models.CharField(max_length=3, default="INR")
    notes = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    journal_entry = models.ForeignKey(
        "finance.JournalEntry", null=True, blank=True, on_delete=models.SET_NULL, related_name="source_bills",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ap_vendor_bill"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.bill_number or f"(draft {self.id})"

    @property
    def subtotal(self):
        from decimal import Decimal
        return sum((ln.amount for ln in self.lines.all()), start=Decimal("0.00"))

    @property
    def tax_total(self):
        from decimal import Decimal
        return sum((t.amount for ln in self.lines.all() for t in ln.taxes.all()), start=Decimal("0.00"))

    @property
    def grand_total(self):
        return self.subtotal + self.tax_total

    # ── open-item management ──
    @property
    def paid_amount(self):
        from decimal import Decimal
        from django.db.models import Sum
        return self.allocations.filter(payment__status="posted").aggregate(s=Sum("amount"))["s"] or Decimal("0.00")

    @property
    def debited_amount(self):
        from decimal import Decimal
        return sum(
            (dn.grand_total for dn in self.debit_notes.filter(status="posted")),
            start=Decimal("0.00"),
        )

    @property
    def outstanding(self):
        return self.grand_total - self.paid_amount - self.debited_amount

    @property
    def settlement_status(self):
        if self.status != self.Status.POSTED:
            return "unposted"
        if self.outstanding <= 0:
            return "paid"
        return "partial" if (self.paid_amount > 0 or self.debited_amount > 0) else "open"


class VendorBillLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="ap_bill_lines")
    bill = models.ForeignKey(VendorBill, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    description = models.CharField(max_length=200, blank=True)
    # The debit side: which expense/asset account this cost books to.
    expense_account = models.ForeignKey(
        "finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="ap_bill_lines",
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_slab = models.ForeignKey("tax.TaxRateSlab", null=True, blank=True, on_delete=models.SET_NULL, related_name="ap_lines")

    class Meta:
        db_table = "ap_bill_line"
        ordering = ["bill", "line_number"]
        unique_together = [("bill", "line_number")]

    @property
    def amount(self):
        from decimal import Decimal
        return (self.quantity * self.unit_price).quantize(Decimal("0.01"))


class VendorBillLineTax(models.Model):
    """Computed INPUT tax breakdown per line (snapshot at post time)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="ap_line_taxes")
    line = models.ForeignKey(VendorBillLine, on_delete=models.CASCADE, related_name="taxes")
    component = models.ForeignKey("tax.TaxComponent", on_delete=models.PROTECT, related_name="ap_line_taxes")
    percentage = models.DecimalField(max_digits=6, decimal_places=2)
    amount = models.DecimalField(max_digits=18, decimal_places=2)

    class Meta:
        db_table = "ap_bill_line_tax"
        ordering = ["line", "component"]


class DebitNote(models.Model):
    """A reduction against an already-posted vendor bill (return, pricing dispute,
    overcharge, ...). On POST, mirrors the bill's G/L postings with debit/credit
    flipped — it reduces Trade Payables, it never touches cash."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="debit_notes")
    company_code = models.ForeignKey("finance.CompanyCode", on_delete=models.PROTECT, related_name="debit_notes")
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="debit_notes")
    bill = models.ForeignKey(VendorBill, on_delete=models.PROTECT, related_name="debit_notes")
    debit_note_number = models.CharField(max_length=20, blank=True)
    note_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    journal_entry = models.ForeignKey(
        "finance.JournalEntry", null=True, blank=True, on_delete=models.SET_NULL, related_name="source_debit_notes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ap_debit_note"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.debit_note_number or f"(draft {self.id})"

    @property
    def subtotal(self):
        from decimal import Decimal
        return sum((ln.amount for ln in self.lines.all()), start=Decimal("0.00"))

    @property
    def tax_total(self):
        from decimal import Decimal
        return sum((t.amount for ln in self.lines.all() for t in ln.taxes.all()), start=Decimal("0.00"))

    @property
    def grand_total(self):
        return self.subtotal + self.tax_total


class DebitNoteLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="ap_debit_note_lines")
    debit_note = models.ForeignKey(DebitNote, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    description = models.CharField(max_length=200, blank=True)
    expense_account = models.ForeignKey(
        "finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="ap_debit_note_lines",
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_slab = models.ForeignKey("tax.TaxRateSlab", null=True, blank=True, on_delete=models.SET_NULL, related_name="ap_debit_lines")

    class Meta:
        db_table = "ap_debit_note_line"
        ordering = ["debit_note", "line_number"]
        unique_together = [("debit_note", "line_number")]

    @property
    def amount(self):
        from decimal import Decimal
        return (self.quantity * self.unit_price).quantize(Decimal("0.01"))


class DebitNoteLineTax(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="ap_debit_line_taxes")
    line = models.ForeignKey(DebitNoteLine, on_delete=models.CASCADE, related_name="taxes")
    component = models.ForeignKey("tax.TaxComponent", on_delete=models.PROTECT, related_name="ap_debit_line_taxes")
    percentage = models.DecimalField(max_digits=6, decimal_places=2)
    amount = models.DecimalField(max_digits=18, decimal_places=2)

    class Meta:
        db_table = "ap_debit_note_line_tax"
        ordering = ["line", "component"]
