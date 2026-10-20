"""
Accounts Receivable (AR) — the customer subledger (SAP FI-AR).

Phase 3 wires everything together:
  • Customer master holds the place-of-supply state + GSTIN (drives tax region).
  • Item master holds the HSN + tax slab (drives the tax rate).
  • A CustomerInvoice, when POSTED, auto-computes tax per line (via the tax engine)
    and generates a balanced G/L document:
        Dr  Trade Receivables (recon account)   total incl. tax
            Cr  Revenue                          per-line base
            Cr  Output tax (CGST/SGST or IGST)   per component

This is the subledger → reconciliation account → General Ledger flow, SAP-faithful.
Master data (Customer/Item) lives here for now; it will move to shared masters when
Sales/Inventory need it.
"""
import uuid

from django.db import models

from erp_server.common.archive import ArchivableModel


class Customer(ArchivableModel):
    """A customer (debtor). The state is the GST place of supply."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="customers")
    code = models.CharField(max_length=16)             # "C-1001"
    name = models.CharField(max_length=160)
    gstin = models.CharField(max_length=20, blank=True)
    state = models.CharField(max_length=64, blank=True)   # place of supply
    email = models.EmailField(blank=True)
    # Override the default AR reconciliation account (else the company's 110000).
    receivable_account = models.ForeignKey(
        "finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="ar_customers",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ar_customer"
        ordering = ["name"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class Item(ArchivableModel):
    """A sellable product/service. HSN maps to a tax slab; revenue posts to its account."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="items")
    code = models.CharField(max_length=24)             # "SKU-100"
    name = models.CharField(max_length=160)
    hsn = models.CharField(max_length=10, blank=True)  # HSN/SAC code
    unit_price = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_slab = models.ForeignKey(
        "tax.TaxRateSlab", null=True, blank=True, on_delete=models.SET_NULL, related_name="items",
    )
    revenue_account = models.ForeignKey(
        "finance.GLAccount", null=True, blank=True, on_delete=models.SET_NULL, related_name="revenue_items",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ar_item"
        ordering = ["name"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class CustomerInvoice(models.Model):
    """AR document header. On post, generates a linked G/L JournalEntry."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="customer_invoices")
    company_code = models.ForeignKey("finance.CompanyCode", on_delete=models.PROTECT, related_name="customer_invoices")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="invoices")
    invoice_number = models.CharField(max_length=20, blank=True)
    invoice_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    currency = models.CharField(max_length=3, default="INR")
    notes = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    # Link to the generated General Ledger document.
    journal_entry = models.ForeignKey(
        "finance.JournalEntry", null=True, blank=True, on_delete=models.SET_NULL, related_name="source_invoices",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ar_customer_invoice"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.invoice_number or f"(draft {self.id})"

    # --- computed totals (from lines) ---
    @property
    def subtotal(self):
        return sum((ln.amount for ln in self.lines.all()), start=__import__("decimal").Decimal("0.00"))

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
    def outstanding(self):
        return self.grand_total - self.paid_amount

    @property
    def settlement_status(self):
        if self.status != self.Status.POSTED:
            return "unposted"
        if self.outstanding <= 0:
            return "paid"
        return "partial" if self.paid_amount > 0 else "open"


class CustomerInvoiceLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="ar_invoice_lines")
    invoice = models.ForeignKey(CustomerInvoice, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField()
    item = models.ForeignKey(Item, null=True, blank=True, on_delete=models.SET_NULL, related_name="invoice_lines")
    description = models.CharField(max_length=200, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    # Tax slab snapshot for this line (defaults from the item).
    tax_slab = models.ForeignKey("tax.TaxRateSlab", null=True, blank=True, on_delete=models.SET_NULL, related_name="ar_lines")

    class Meta:
        db_table = "ar_invoice_line"
        ordering = ["invoice", "line_number"]
        unique_together = [("invoice", "line_number")]

    @property
    def amount(self):
        return (self.quantity * self.unit_price).quantize(__import__("decimal").Decimal("0.01"))


class CustomerInvoiceLineTax(models.Model):
    """Computed tax breakdown per line (one row per component). Snapshot at post time."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="ar_line_taxes")
    line = models.ForeignKey(CustomerInvoiceLine, on_delete=models.CASCADE, related_name="taxes")
    component = models.ForeignKey("tax.TaxComponent", on_delete=models.PROTECT, related_name="ar_line_taxes")
    percentage = models.DecimalField(max_digits=6, decimal_places=2)
    amount = models.DecimalField(max_digits=18, decimal_places=2)

    class Meta:
        db_table = "ar_invoice_line_tax"
        ordering = ["line", "component"]

    def __str__(self) -> str:
        return f"{self.component.code} {self.percentage}% = {self.amount}"
