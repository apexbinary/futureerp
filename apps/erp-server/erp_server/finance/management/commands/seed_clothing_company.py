"""
Generate several months of realistic, varied transactions for a clothing-retail
tenant — not static demo rows, but a day-by-day simulation posted through the real
service layer (so tax, G/L balancing, and numbering all come out exactly as they
would from the UI):

  • AR: customer invoices across 6 clothing customers (intra + inter-state), most
    posted, a few left as drafts (in-progress orders), a few reversed (returns).
  • AP: vendor bills for fabric, packaging, logistics, and utilities (one vendor's
    bills are GST-exempt — electricity), mirroring the same draft/posted/reversed mix.
  • Payments: customer receipts and vendor payments with full / partial / unpaid
    outcomes depending on invoice age, so AR/AP aging reports have real spread.
  • Fixed assets (store fixtures, POS system, delivery van) with a monthly
    straight-line depreciation run for every month in the window.
  • Manual G/L entries: opening capital, monthly rent, monthly payroll accrual +
    payout, and one deliberate error + reversal.

Seasonality: a Diwali/festive sales spike in Oct/Nov, a monsoon dip in Jul/Aug.

Requires seed_finance (+ ideally seed_tax, seed_co) already run for the tenant.
NOT idempotent — re-running adds another batch on top. Pass --force to do that
on purpose; otherwise it refuses if the tenant already has AR invoices.

Usage: manage.py seed_clothing_company --tenant abc --months 6
"""
from __future__ import annotations

import calendar
import random
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand, CommandError

from erp_server.aa.models import FixedAsset
from erp_server.aa.service import run_depreciation
from erp_server.ap.models import Vendor, VendorBill, VendorBillLine, VendorBillLineTax
from erp_server.ap.service import BillError, post_bill, reverse_bill
from erp_server.ar.models import Customer, CustomerInvoice, CustomerInvoiceLine, CustomerInvoiceLineTax, Item
from erp_server.ar.service import InvoiceError, post_invoice, reverse_invoice
from erp_server.co.models import CostCenter
from erp_server.finance.models import ChartOfAccounts, CompanyCode, GLAccount, JournalEntry, JournalEntryLine
from erp_server.finance.service import post_journal_entry, reverse_journal_entry
from erp_server.identity.models import Tenant
from erp_server.payments.models import Payment, PaymentAllocation
from erp_server.payments.service import PaymentError, post_payment
from erp_server.tax.models import TaxRateSlab
from erp_server.tax.service import compute_tax, determine_region

TWO = Decimal("0.01")
DC = JournalEntryLine.DC


def d2(x) -> Decimal:
    return Decimal(str(x)).quantize(TWO, rounding=ROUND_HALF_UP)


def add_months(dt: date, months: int) -> date:
    m = dt.month - 1 + months
    y = dt.year + m // 12
    m = m % 12 + 1
    day = min(dt.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)


def net_days(terms: str) -> int:
    try:
        return int(terms.strip().split()[-1])
    except (ValueError, IndexError, AttributeError):
        return 30


# Seasonal demand multiplier by calendar month: festive spike (Diwali ~Oct/Nov),
# monsoon dip (Jul/Aug).
SEASON = {1: 1.0, 2: 0.95, 3: 1.05, 4: 0.9, 5: 0.85, 6: 0.8,
          7: 0.72, 8: 0.78, 9: 1.1, 10: 1.6, 11: 1.35, 12: 1.15}

CUSTOMERS = [
    # code, name, gstin, state, email, payment terms
    ("C-CL01", "Trendy Threads Boutique", "27AAPCT5678K1Z4", "Maharashtra", "orders@trendythreads.example", "Net 15"),
    ("C-CL02", "Urban Closet Retail", "27AAPCU8821M1Z7", "Maharashtra", "purchase@urbancloset.example", "Net 30"),
    ("C-CL03", "Pune Lifestyle Store", "27AAPCP3345N1Z2", "Maharashtra", "accounts@punelifestyle.example", "Net 15"),
    ("C-CL04", "Delhi Fashion House", "07AAPCD2211P1Z8", "Delhi", "finance@delhifashion.example", "Net 30"),
    ("C-CL05", "Chennai Apparel Mart", "33AAPCC6654Q1Z1", "Tamil Nadu", "ap@chennaiapparel.example", "Net 45"),
    ("C-CL06", "Bangalore Streetwear Co.", "29AAPCB9987R1Z3", "Karnataka", "billing@blrstreetwear.example", "Net 30"),
]

VENDORS = [
    # code, name, gstin, state, email, payment terms, category
    ("V-CL01", "Surat Textile Mills", "24AAVCS1122A1Z5", "Gujarat", "sales@surattextile.example", "Net 30", "fabric"),
    ("V-CL02", "Tirupur Knitwear Exports", "33AAVCT3344B1Z6", "Tamil Nadu", "export@tirupurknit.example", "Net 45", "fabric"),
    ("V-CL03", "Mumbai Packaging Solutions", "27AAVCM5566C1Z9", "Maharashtra", "sales@mumbaipack.example", "Net 15", "packaging"),
    ("V-CL04", "Swift Logistics Pvt Ltd", "27AAVCS7788D1Z1", "Maharashtra", "ops@swiftlogistics.example", "Net 15", "logistics"),
    ("V-CL05", "City Power & Utilities", "27AAVCC9900E1Z4", "Maharashtra", "billing@citypower.example", "Net 7", "utility"),
]

ITEMS = [
    # code, name, hsn, price, slab
    ("SKU-TS01", "Men's Cotton T-Shirt", "6109", "499.00", "GST5"),
    ("SKU-TS02", "Women's Graphic T-Shirt", "6109", "599.00", "GST5"),
    ("SKU-SH01", "Men's Formal Shirt", "6205", "899.00", "GST5"),
    ("SKU-SH02", "Women's Casual Shirt", "6206", "849.00", "GST5"),
    ("SKU-KU01", "Men's Cotton Kurta", "6205", "799.00", "GST5"),
    ("SKU-JN01", "Men's Slim Fit Jeans", "6203", "1499.00", "GST12"),
    ("SKU-JN02", "Women's High-Waist Jeans", "6204", "1599.00", "GST12"),
    ("SKU-DR01", "Women's Summer Dress", "6204", "1299.00", "GST12"),
    ("SKU-JK01", "Men's Denim Jacket", "6201", "2499.00", "GST12"),
    ("SKU-JK02", "Women's Winter Jacket", "6202", "3499.00", "GST18"),
    ("SKU-SR01", "Women's Silk Saree", "6204", "4999.00", "GST18"),
    ("SKU-AC01", "Leather Belt", "4203", "599.00", "GST18"),
]

# category -> (expense account number, tax slab code or None, (min, max) amount)
BILL_PROFILE = {
    "fabric": ("500000", "GST5", (15000, 45000)),
    "packaging": ("510000", "GST18", (4000, 10000)),
    "logistics": ("500000", "GST18", (6000, 14000)),
    "utility": ("510000", None, (12000, 20000)),
}

ASSETS = [
    # code, name, class, cost, salvage, useful life (years)
    ("AST-001", "Store Fixtures & Shelving", "Furniture & Fixtures", Decimal("500000.00"), Decimal("0.00"), 5),
    ("AST-002", "POS Billing System", "IT Equipment", Decimal("150000.00"), Decimal("0.00"), 3),
    ("AST-003", "Delivery Van", "Vehicles", Decimal("850000.00"), Decimal("50000.00"), 8),
]


class Command(BaseCommand):
    help = "Generate N months of realistic clothing-retail transactions (AR/AP/payments/assets/manual JEs)."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--months", type=int, default=6)
        parser.add_argument("--seed", type=int, default=42)
        parser.add_argument("--force", action="store_true", help="Run even if this tenant already has AR invoices.")

    def handle(self, *args, **opts):
        try:
            tenant = Tenant.objects.get(code=opts["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with code '{opts['tenant']}'.")

        if CustomerInvoice.objects.filter(tenant=tenant).exists() and not opts["force"]:
            raise CommandError(
                "This tenant already has AR invoices — re-running would pile on duplicates. "
                "Wipe the transactional tables first, or pass --force to add another batch anyway."
            )

        coa = ChartOfAccounts.objects.filter(tenant=tenant).first()
        cc = CompanyCode.objects.filter(tenant=tenant).first()
        if not coa or not cc:
            raise CommandError(f"No chart of accounts / company code for '{tenant.code}' — run seed_finance first.")

        random.seed(opts["seed"])
        today = date.today()
        months = opts["months"]
        start = add_months(today, -months)

        def acct(num: str) -> GLAccount:
            a = GLAccount.objects.filter(tenant=tenant, chart_of_accounts=coa, account_number=num).first()
            if not a:
                raise CommandError(f"GL account {num} missing for '{tenant.code}' — run seed_finance first.")
            return a

        bank_acct = acct("100100")
        cost_center = CostCenter.objects.filter(tenant=tenant, code="CC-300").first()

        # ── master data ──────────────────────────────────────────────────
        customers = []
        for code, name, gstin, state, email, terms in CUSTOMERS:
            c, _ = Customer.objects.update_or_create(
                tenant=tenant, code=code,
                defaults={"name": name, "gstin": gstin, "state": state, "email": email, "payment_terms": terms},
            )
            customers.append(c)

        vendors = {}
        for code, name, gstin, state, email, terms, category in VENDORS:
            v, _ = Vendor.objects.update_or_create(
                tenant=tenant, code=code,
                defaults={"name": name, "gstin": gstin, "state": state, "email": email, "payment_terms": terms},
            )
            vendors[code] = (v, category)

        revenue_acct = acct("400000")
        items = []
        for code, name, hsn, price, slab_code in ITEMS:
            slab = TaxRateSlab.objects.filter(tenant=tenant, code=slab_code).first()
            it, _ = Item.objects.update_or_create(
                tenant=tenant, code=code,
                defaults={"name": name, "hsn": hsn, "unit_price": Decimal(price),
                          "tax_slab": slab, "revenue_account": revenue_acct},
            )
            items.append(it)

        self.stdout.write(
            f"Master data: {len(customers)} customers, {len(vendors)} vendors, {len(items)} items."
        )

        # ── AR: build + post invoices day by day ────────────────────────
        draft_invoices, posted_invoices = [], []
        day = start
        while day <= today:
            if day.weekday() != 6 and random.random() > 0.03:  # skip Sundays + rare closures
                mu = 1.3 * SEASON.get(day.month, 1.0)
                n = max(0, min(8, int(round(random.gauss(mu, max(0.6, mu * 0.4))))))
                for _ in range(n):
                    inv = self._build_invoice(tenant, cc, customers, items, day)
                    draft_invoices.append(inv)
            day += timedelta(days=1)

        # Leave the most recent few as drafts (orders not yet finalized).
        draft_cutoff = max(0, len(draft_invoices) - 6)
        to_post, left_draft = draft_invoices[:draft_cutoff], draft_invoices[draft_cutoff:]

        for inv in to_post:
            try:
                posted_invoices.append(post_invoice(inv))
            except InvoiceError as exc:
                self.stderr.write(f"  skip invoice {inv.id}: {exc}")

        # A few early, not-yet-paid invoices become returns/cancellations.
        early_half = posted_invoices[: len(posted_invoices) // 2] or posted_invoices
        reversed_ar = random.sample(early_half, k=min(3, len(early_half)))
        for inv in reversed_ar:
            try:
                reverse_invoice(inv)
            except InvoiceError as exc:
                self.stderr.write(f"  skip reversal of {inv.invoice_number}: {exc}")

        settleable = [i for i in posted_invoices if i not in reversed_ar]
        for inv in settleable:
            self._settle_invoice(tenant, cc, inv, today)

        self.stdout.write(
            f"AR: {len(posted_invoices) + len(left_draft)} invoices "
            f"({len(posted_invoices)} posted, {len(left_draft)} draft, {len(reversed_ar)} reversed)."
        )

        # ── AP: monthly vendor bills ─────────────────────────────────────
        draft_bills, posted_bills = [], []
        for i in range(months + 1):
            month_date = add_months(start, i)
            if month_date > today:
                break
            for code, (vendor, category) in vendors.items():
                exp_num, slab_code, (lo, hi) = BILL_PROFILE[category]
                count = 2 if category in ("fabric", "logistics") else 1
                for _ in range(count):
                    bill = self._build_bill(
                        tenant, cc, vendor, exp_num, slab_code, lo, hi, month_date, today, acct,
                    )
                    draft_bills.append(bill)

        bill_cutoff = max(0, len(draft_bills) - 3)
        to_post_bills, left_draft_bills = draft_bills[:bill_cutoff], draft_bills[bill_cutoff:]
        for bill in to_post_bills:
            try:
                posted_bills.append(post_bill(bill))
            except BillError as exc:
                self.stderr.write(f"  skip bill {bill.id}: {exc}")

        early_bills = posted_bills[: len(posted_bills) // 2] or posted_bills
        reversed_ap = random.sample(early_bills, k=min(2, len(early_bills)))
        for bill in reversed_ap:
            try:
                reverse_bill(bill)
            except BillError as exc:
                self.stderr.write(f"  skip reversal of {bill.bill_number}: {exc}")

        settleable_bills = [b for b in posted_bills if b not in reversed_ap]
        for bill in settleable_bills:
            self._settle_bill(tenant, cc, bill, today)

        self.stdout.write(
            f"AP: {len(posted_bills) + len(left_draft_bills)} bills "
            f"({len(posted_bills)} posted, {len(left_draft_bills)} draft, {len(reversed_ap)} reversed)."
        )

        # ── Fixed assets + monthly depreciation ─────────────────────────
        acquisition_date = start - timedelta(days=15)
        fixed_assets_acct = acct("150000")
        for code, name, klass, cost, salvage, life in ASSETS:
            asset, created = FixedAsset.objects.update_or_create(
                tenant=tenant, code=code,
                defaults={"company_code": cc, "name": name, "asset_class": klass,
                          "acquisition_date": acquisition_date, "acquisition_cost": cost,
                          "salvage_value": salvage, "useful_life_years": life},
            )
            if created:
                je = JournalEntry.objects.create(
                    tenant=tenant, company_code=cc, document_type=JournalEntry.DocumentType.GENERAL,
                    posting_date=acquisition_date, document_date=acquisition_date, currency="INR",
                    header_text=f"Asset acquisition · {name}", source_type=JournalEntry.SourceType.MANUAL,
                )
                JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=1,
                                                gl_account=fixed_assets_acct, debit_credit=DC.DEBIT,
                                                amount=cost, line_text=f"Acquire {name}")
                JournalEntryLine.objects.create(tenant=tenant, journal_entry=je, line_number=2,
                                                gl_account=bank_acct, debit_credit=DC.CREDIT,
                                                amount=cost, line_text=f"Acquire {name}")
                post_journal_entry(je)

        dep_runs = 0
        for i in range(months + 1):
            period_date = add_months(start, i)
            if period_date > today:
                break
            result = run_depreciation(tenant, cc, period_date)
            dep_runs += result["count"]
        self.stdout.write(f"AA: {len(ASSETS)} fixed assets, {dep_runs} depreciation postings.")

        # ── Manual G/L entries: capital, rent, payroll + one correction ──
        share_capital_acct = acct("300000")
        rent_acct = acct("520000")
        salary_exp_acct = acct("530000")
        salary_payable_acct = acct("220000")

        def manual_je(posting_date, header, lines, doc_type=JournalEntry.DocumentType.GENERAL):
            je = JournalEntry.objects.create(
                tenant=tenant, company_code=cc, document_type=doc_type,
                posting_date=posting_date, document_date=posting_date, currency="INR",
                header_text=header, source_type=JournalEntry.SourceType.MANUAL,
            )
            for n, (gl, dc, amt, text, cc_dim) in enumerate(lines, start=1):
                JournalEntryLine.objects.create(
                    tenant=tenant, journal_entry=je, line_number=n, gl_account=gl,
                    debit_credit=dc, amount=amt, line_text=text, cost_center=cc_dim,
                )
            return post_journal_entry(je)

        manual_count = 0
        manual_je(start, "Opening capital infusion", [
            (bank_acct, DC.DEBIT, Decimal("6000000.00"), "Capital infusion", None),
            (share_capital_acct, DC.CREDIT, Decimal("6000000.00"), "Capital infusion", None),
        ])
        manual_count += 1

        base_salary = Decimal("180000.00")
        for i in range(months + 1):
            month_date = add_months(start, i)
            if month_date > today:
                break
            last_day = calendar.monthrange(month_date.year, month_date.month)[1]
            accrual_date = min(date(month_date.year, month_date.month, last_day), today)
            salary = d2(base_salary * (Decimal("1.0") + Decimal("0.025") * i))

            manual_je(accrual_date, f"Salary accrual · {month_date.strftime('%b %Y')}", [
                (salary_exp_acct, DC.DEBIT, salary, "Salaries", cost_center),
                (salary_payable_acct, DC.CREDIT, salary, "Salaries", None),
            ])
            pay_date = min(accrual_date + timedelta(days=3), today)
            manual_je(pay_date, f"Salary payout · {month_date.strftime('%b %Y')}", [
                (salary_payable_acct, DC.DEBIT, salary, "Salary payout", None),
                (bank_acct, DC.CREDIT, salary, "Salary payout", None),
            ])
            rent_date = min(date(month_date.year, month_date.month, 5), today)
            manual_je(rent_date, f"Store rent · {month_date.strftime('%b %Y')}", [
                (rent_acct, DC.DEBIT, Decimal("45000.00"), "Rent", cost_center),
                (bank_acct, DC.CREDIT, Decimal("45000.00"), "Rent", None),
            ])
            manual_count += 3

        # A deliberate error, caught and reversed — shows the correction path.
        dup_date = min(add_months(start, 1), today)
        dup_je = manual_je(dup_date, "Store rent (entered twice by mistake)", [
            (rent_acct, DC.DEBIT, Decimal("45000.00"), "Rent (duplicate)", cost_center),
            (bank_acct, DC.CREDIT, Decimal("45000.00"), "Rent (duplicate)", None),
        ])
        reverse_journal_entry(dup_je)
        manual_count += 2  # the error + its reversal

        self.stdout.write(f"GL: {manual_count} manual journal entries (incl. 1 reversed correction).")

        self.stdout.write(self.style.SUCCESS(
            f"[OK] Clothing-company data seeded for {tenant.name}: "
            f"{start.isoformat()} .. {today.isoformat()}."
        ))

    # ── helpers ──────────────────────────────────────────────────────────
    def _build_invoice(self, tenant, cc, customers, items, day) -> CustomerInvoice:
        customer = random.choice(customers)
        terms = customer.payment_terms or "Net 30"
        inv = CustomerInvoice.objects.create(
            tenant=tenant, company_code=cc, customer=customer,
            invoice_date=day, baseline_date=day, due_date=day + timedelta(days=net_days(terms)),
            payment_terms=terms, currency="INR",
        )
        region = determine_region(cc.state, customer.state)
        basket = random.sample(items, k=random.randint(1, min(4, len(items))))
        for n, item in enumerate(basket, start=1):
            price = item.unit_price if random.random() > 0.2 else d2(item.unit_price * Decimal(str(random.uniform(0.9, 0.98))))
            line = CustomerInvoiceLine.objects.create(
                tenant=tenant, invoice=inv, line_number=n, item=item,
                quantity=random.randint(1, 3), unit_price=price, tax_slab=item.tax_slab,
            )
            if item.tax_slab:
                for tl in compute_tax(item.tax_slab, region, line.amount):
                    CustomerInvoiceLineTax.objects.create(
                        tenant=tenant, line=line, component_id=tl.component_id,
                        percentage=tl.percentage, amount=tl.amount,
                    )
        return inv

    def _build_bill(self, tenant, cc, vendor, exp_num, slab_code, lo, hi, month_date, today, acct) -> VendorBill:
        last_day = calendar.monthrange(month_date.year, month_date.month)[1]
        bill_date = date(month_date.year, month_date.month, random.randint(1, last_day))
        if bill_date > today:
            bill_date = today
        terms = vendor.payment_terms or "Net 30"
        bill = VendorBill.objects.create(
            tenant=tenant, company_code=cc, vendor=vendor,
            bill_date=bill_date, baseline_date=bill_date, due_date=bill_date + timedelta(days=net_days(terms)),
            payment_terms=terms, vendor_ref=f"{vendor.code}-{random.randint(1000, 9999)}", currency="INR",
        )
        slab = TaxRateSlab.objects.filter(tenant=tenant, code=slab_code).first() if slab_code else None
        line = VendorBillLine.objects.create(
            tenant=tenant, bill=bill, line_number=1,
            description=f"{vendor.name} · {month_date.strftime('%b %Y')}",
            expense_account=acct(exp_num), quantity=1,
            unit_price=Decimal(random.randint(lo, hi)), tax_slab=slab,
        )
        if slab:
            region = determine_region(cc.state, vendor.state)
            for tl in compute_tax(slab, region, line.amount):
                VendorBillLineTax.objects.create(
                    tenant=tenant, line=line, component_id=tl.component_id,
                    percentage=tl.percentage, amount=tl.amount,
                )
        return bill

    def _settle_invoice(self, tenant, cc, inv, today):
        grand = inv.grand_total
        if grand <= 0:
            return
        age = (today - inv.invoice_date).days
        terms_days = net_days(inv.payment_terms or "Net 30")
        roll = random.random()
        if age > 45:
            outcome = "full" if roll < 0.80 else ("partial" if roll < 0.95 else "none")
        elif age > 15:
            outcome = "full" if roll < 0.50 else ("partial" if roll < 0.80 else "none")
        else:
            outcome = "full" if roll < 0.20 else ("partial" if roll < 0.40 else "none")
        if outcome == "none":
            return
        amount = grand if outcome == "full" else d2(grand * Decimal(str(random.uniform(0.3, 0.7))))
        pay_date = min(today, inv.invoice_date + timedelta(days=random.randint(3, max(6, terms_days + 10))))
        if amount <= 0:
            return
        try:
            p = Payment.objects.create(
                tenant=tenant, company_code=cc, direction=Payment.Direction.RECEIPT,
                customer=inv.customer, payment_date=pay_date, amount=amount, invoice=inv,
                reference=f"UTR{random.randint(100000, 999999)}", notes="Customer settlement",
            )
            p = post_payment(p)
            PaymentAllocation.objects.create(tenant=tenant, payment=p, invoice=inv, amount=amount)
        except PaymentError as exc:
            self.stderr.write(f"  skip receipt for {inv.invoice_number}: {exc}")

    def _settle_bill(self, tenant, cc, bill, today):
        grand = bill.grand_total
        if grand <= 0:
            return
        age = (today - bill.bill_date).days
        roll = random.random()
        outcome = "full" if roll < 0.75 else ("partial" if roll < 0.92 else "none")
        if age < 7:
            outcome = "none" if roll > 0.3 else outcome
        if outcome == "none":
            return
        amount = grand if outcome == "full" else d2(grand * Decimal(str(random.uniform(0.3, 0.7))))
        pay_date = min(today, bill.bill_date + timedelta(days=random.randint(2, 20)))
        if amount <= 0:
            return
        try:
            p = Payment.objects.create(
                tenant=tenant, company_code=cc, direction=Payment.Direction.PAYMENT,
                vendor=bill.vendor, payment_date=pay_date, amount=amount, bill=bill,
                reference=f"NEFT{random.randint(100000, 999999)}", notes="Vendor settlement",
            )
            p = post_payment(p)
            PaymentAllocation.objects.create(tenant=tenant, payment=p, bill=bill, amount=amount)
        except PaymentError as exc:
            self.stderr.write(f"  skip payment for {bill.bill_number}: {exc}")
