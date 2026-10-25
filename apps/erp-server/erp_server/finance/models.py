"""
Finance (FI) — Phase 1: Organizational structure + General Ledger.

SAP-faithful design (see memory: finance-module-sap-blueprint):
  • Org structure (CompanyCode, ChartOfAccounts, GLAccount, FiscalYear/PostingPeriod)
    must exist before anything can post.
  • The General Ledger is the hub. Every transaction is an immutable DOCUMENT
    (JournalEntry header + >=2 JournalEntryLine items) where debits MUST equal credits.
  • JournalEntryLine is our "Universal Journal" (SAP ACDOCA) — the single line-item
    source of truth that every submodule (AR/AP/AA/tax) will write into.

All models are tenant-scoped (erp-server is multi-tenant in the cloud).
"""
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models

from erp_server.common.archive import ArchivableModel


# ──────────────────────────────────────────────────────────────────────────
# Organizational structure (master data)
# ──────────────────────────────────────────────────────────────────────────
class ChartOfAccounts(ArchivableModel):
    """The master list container of G/L accounts (an 'operating' chart)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="charts_of_accounts"
    )
    code = models.CharField(max_length=10)          # e.g. "INGA"
    name = models.CharField(max_length=128)
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fin_chart_of_accounts"
        ordering = ["code"]
        unique_together = [("tenant", "code")]
        verbose_name_plural = "charts of accounts"

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class GLAccount(ArchivableModel):
    """An individual G/L account within a chart of accounts."""

    class Type(models.TextChoices):
        ASSET = "asset", "Asset"
        LIABILITY = "liability", "Liability"
        EQUITY = "equity", "Equity"
        REVENUE = "revenue", "Revenue"
        EXPENSE = "expense", "Expense"

    class Statement(models.TextChoices):
        BALANCE_SHEET = "balance_sheet", "Balance Sheet"
        PROFIT_LOSS = "profit_loss", "Profit & Loss"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="gl_accounts"
    )
    chart_of_accounts = models.ForeignKey(
        ChartOfAccounts, on_delete=models.CASCADE, related_name="accounts"
    )
    account_number = models.CharField(max_length=10)   # e.g. "400000"
    name = models.CharField(max_length=128)
    account_type = models.CharField(max_length=12, choices=Type.choices)
    statement = models.CharField(max_length=14, choices=Statement.choices)
    # Marks subledger reconciliation accounts (AP/AR/AA auto-post their totals here).
    is_reconciliation = models.BooleanField(default=False)
    blocked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fin_gl_account"
        ordering = ["account_number"]
        unique_together = [("chart_of_accounts", "account_number")]

    def __str__(self) -> str:
        return f"{self.account_number} · {self.name}"


class CompanyCode(models.Model):
    """An independent legal entity — the level at which a legal balance sheet is produced."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="company_codes"
    )
    code = models.CharField(max_length=4)              # SAP convention, e.g. "1000"
    name = models.CharField(max_length=128)
    currency = models.CharField(max_length=3, default="INR")
    country = models.CharField(max_length=2, default="IN")
    state = models.CharField(max_length=64, blank=True)   # supplier state for GST place-of-supply
    gstin = models.CharField(max_length=20, blank=True)
    chart_of_accounts = models.ForeignKey(
        ChartOfAccounts, on_delete=models.PROTECT, related_name="company_codes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fin_company_code"
        ordering = ["code"]
        unique_together = [("tenant", "code")]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class ExchangeRate(models.Model):
    """FX rate to the company's functional currency, effective from `rate_date`
    until superseded by a later one. `rate_to_base`: how many base-currency units
    equal 1 unit of `currency` (e.g. currency=USD, rate_to_base=84.50 → 1 USD = ₹84.50)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="exchange_rates"
    )
    currency = models.CharField(max_length=3)
    rate_date = models.DateField()
    rate_to_base = models.DecimalField(max_digits=18, decimal_places=6)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fin_exchange_rate"
        ordering = ["-rate_date", "currency"]
        unique_together = [("tenant", "currency", "rate_date")]

    def __str__(self) -> str:
        return f"1 {self.currency} = {self.rate_to_base} ({self.rate_date})"


class FiscalYear(models.Model):
    """A fiscal year for a company code; owns its posting periods."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="fiscal_years"
    )
    company_code = models.ForeignKey(
        CompanyCode, on_delete=models.CASCADE, related_name="fiscal_years"
    )
    year = models.PositiveIntegerField()               # e.g. 2026
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)

    class Meta:
        db_table = "fin_fiscal_year"
        ordering = ["-year"]
        unique_together = [("company_code", "year")]

    def __str__(self) -> str:
        return f"{self.company_code.code} · FY{self.year}"


class PostingPeriod(models.Model):
    """A posting period (usually a month). Postings are only allowed into OPEN periods."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="posting_periods"
    )
    fiscal_year = models.ForeignKey(
        FiscalYear, on_delete=models.CASCADE, related_name="periods"
    )
    period = models.PositiveSmallIntegerField()        # 1..12 (+ specials later)
    start_date = models.DateField()
    end_date = models.DateField()
    is_open = models.BooleanField(default=True)

    class Meta:
        db_table = "fin_posting_period"
        ordering = ["fiscal_year", "period"]
        unique_together = [("fiscal_year", "period")]

    def __str__(self) -> str:
        return f"{self.fiscal_year} P{self.period:02d}"


# ──────────────────────────────────────────────────────────────────────────
# General Ledger — the document (SAP document principle) + Universal Journal
# ──────────────────────────────────────────────────────────────────────────
class JournalEntry(models.Model):
    """
    A financial document (header). Immutable once posted; corrected only via reversal.
    Debits must equal credits before it can move from DRAFT to POSTED.
    """

    class DocumentType(models.TextChoices):
        GL = "SA", "G/L Account Document"
        VENDOR_INVOICE = "KR", "Vendor Invoice"
        CUSTOMER_INVOICE = "DR", "Customer Invoice"
        CREDIT_NOTE = "DG", "Customer Credit Note"
        DEBIT_NOTE = "KG", "Vendor Debit Note"
        GENERAL = "AB", "General Document"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"
        REVERSED = "reversed", "Reversed"

    class SourceType(models.TextChoices):
        """Originating transaction (SAP 'reference transaction', AWTYP)."""
        MANUAL = "manual", "Manual entry"
        AR_INVOICE = "ar_invoice", "Customer invoice"
        AP_BILL = "ap_bill", "Vendor invoice"
        AR_RECEIPT = "ar_receipt", "Customer receipt"
        AP_PAYMENT = "ap_payment", "Vendor payment"
        AR_CREDIT_NOTE = "ar_credit_note", "Customer credit note"
        AP_DEBIT_NOTE = "ap_debit_note", "Vendor debit note"
        DEPRECIATION = "depreciation", "Depreciation"
        FX_REVALUATION = "fx_revaluation", "FX revaluation"
        REVERSAL = "reversal", "Reversal"

    class PartyType(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        VENDOR = "vendor", "Vendor"
        BANK = "bank", "Bank"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="journal_entries"
    )
    company_code = models.ForeignKey(
        CompanyCode, on_delete=models.PROTECT, related_name="journal_entries"
    )
    # Sequential per company code + fiscal year; assigned at posting time.
    document_number = models.CharField(max_length=20, blank=True)
    fiscal_year = models.PositiveIntegerField(null=True, blank=True)
    document_type = models.CharField(
        max_length=2, choices=DocumentType.choices, default=DocumentType.GL
    )
    posting_date = models.DateField()
    document_date = models.DateField()
    # Always the company's functional currency — foreign-currency source documents
    # (AR/AP) are converted at this rate before their lines are booked here.
    currency = models.CharField(max_length=3, default="INR")
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal("1"))
    reference = models.CharField(max_length=64, blank=True)
    header_text = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)

    # ── Document flow / traceability (SAP AWTYP/AWKEY + business partner) ──
    # Which transaction created this document, and a pointer back to it. Lets us
    # fetch "all journals for this customer / this invoice / all receipts" cheaply
    # without walking reverse relations across apps.
    source_type = models.CharField(
        max_length=16, choices=SourceType.choices, default=SourceType.MANUAL
    )
    source_id = models.UUIDField(null=True, blank=True)          # id of the originating document
    source_number = models.CharField(max_length=32, blank=True)  # its human number (INV-00001 …)
    # Business partner this document settles against (denormalized for fast filtering).
    party_type = models.CharField(max_length=10, choices=PartyType.choices, blank=True)
    party_code = models.CharField(max_length=32, blank=True)
    party_name = models.CharField(max_length=128, blank=True)

    # Reversal linkage — never hard-delete a posted document.
    reverses = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="reversed_by"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="journal_entries_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "fin_journal_entry"
        ordering = ["-created_at"]
        unique_together = [("company_code", "fiscal_year", "document_number")]
        verbose_name_plural = "journal entries"
        indexes = [
            models.Index(fields=["tenant", "party_type", "party_code"]),
            models.Index(fields=["tenant", "source_type"]),
            models.Index(fields=["tenant", "source_id"]),
        ]

    def __str__(self) -> str:
        return self.document_number or f"(draft {self.id})"

    # --- balancing helpers (the iron rule: debits == credits) ---
    @property
    def total_debit(self) -> Decimal:
        return sum(
            (ln.amount for ln in self.lines.all() if ln.debit_credit == JournalEntryLine.DC.DEBIT),
            Decimal("0.00"),
        )

    @property
    def total_credit(self) -> Decimal:
        return sum(
            (ln.amount for ln in self.lines.all() if ln.debit_credit == JournalEntryLine.DC.CREDIT),
            Decimal("0.00"),
        )

    @property
    def is_balanced(self) -> bool:
        return self.total_debit == self.total_credit and self.total_debit > 0


class JournalEntryLine(models.Model):
    """
    A single posting line = our Universal Journal (SAP ACDOCA) row.
    Every submodule (AR/AP/AA/tax) will ultimately write lines here, carrying all
    dimensions. Phase 1 keeps the core dimensions; more are added per phase.
    """

    class DC(models.TextChoices):
        DEBIT = "D", "Debit"
        CREDIT = "C", "Credit"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "identity.Tenant", on_delete=models.CASCADE, related_name="journal_lines"
    )
    journal_entry = models.ForeignKey(
        JournalEntry, on_delete=models.CASCADE, related_name="lines"
    )
    line_number = models.PositiveIntegerField()
    gl_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, related_name="journal_lines"
    )
    debit_credit = models.CharField(max_length=1, choices=DC.choices)
    # SAP Posting Key: 40 = G/L debit, 50 = G/L credit, 01 = customer, 31 = vendor, ...
    posting_key = models.CharField(max_length=2, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    line_text = models.CharField(max_length=255, blank=True)      # Item Text (Segmenttext)
    assignment = models.CharField(max_length=18, blank=True)       # Assignment (Zuordnung)
    # Universal Journal dimensions:
    cost_center = models.ForeignKey(
        "co.CostCenter", null=True, blank=True, on_delete=models.SET_NULL, related_name="journal_lines",
    )
    profit_center = models.ForeignKey(
        "co.ProfitCenter", null=True, blank=True, on_delete=models.SET_NULL, related_name="journal_lines",
    )
    business_area = models.CharField(max_length=8, blank=True)     # Business Area (Geschäftsbereich)
    segment = models.CharField(max_length=16, blank=True)          # Segment

    class Meta:
        db_table = "fin_journal_line"
        ordering = ["journal_entry", "line_number"]
        unique_together = [("journal_entry", "line_number")]

    def save(self, *args, **kwargs):
        # Default SAP posting key for G/L lines: 40 (debit) / 50 (credit).
        # Subledger lines (customer 01 / vendor 31) set it explicitly in their service.
        if not self.posting_key:
            self.posting_key = "40" if self.debit_credit == self.DC.DEBIT else "50"
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.line_number}: {self.gl_account.account_number} {self.debit_credit} {self.amount}"
