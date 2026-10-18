"""
Financial reports — read the posted Universal Journal (JournalEntryLine) and derive
the classic statements. All read-only aggregations; the ledger is the single truth.

  • Trial Balance  — every account's net, in its debit or credit column (must balance).
  • Profit & Loss  — revenue − expenses = net profit for the period.
  • Balance Sheet  — assets = liabilities + equity (+ current-period earnings).
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Q, Sum

from .models import GLAccount, JournalEntry, JournalEntryLine

DEBIT_NORMAL = {"asset", "expense"}
ZERO = Decimal("0.00")


def _balances(tenant, as_of=None):
    """[(GLAccount, debit_total, credit_total)] over documents that hit the ledger (<= as_of).

    Includes POSTED and REVERSED documents: a reversed original's lines remain in the
    ledger and are offset by its reversal (they net to zero) — exactly like SAP.
    """
    qs = JournalEntryLine.objects.filter(
        tenant=tenant,
        journal_entry__status__in=[JournalEntry.Status.POSTED, JournalEntry.Status.REVERSED],
    )
    if as_of:
        qs = qs.filter(journal_entry__posting_date__lte=as_of)
    agg = {
        r["gl_account"]: (r["d"] or ZERO, r["c"] or ZERO)
        for r in qs.values("gl_account").annotate(
            d=Sum("amount", filter=Q(debit_credit="D")),
            c=Sum("amount", filter=Q(debit_credit="C")),
        )
    }
    out = []
    for acc in GLAccount.objects.filter(tenant=tenant).order_by("account_number"):
        d, c = agg.get(acc.id, (ZERO, ZERO))
        out.append((acc, d, c))
    return out


def _signed(acc: GLAccount, d: Decimal, c: Decimal) -> Decimal:
    """Natural balance as a positive number on the account's normal side."""
    return (d - c) if acc.account_type in DEBIT_NORMAL else (c - d)


def trial_balance(tenant, as_of=None) -> dict:
    rows, tot_d, tot_c = [], ZERO, ZERO
    for acc, d, c in _balances(tenant, as_of):
        net = d - c
        if net == 0 and d == 0 and c == 0:
            continue
        debit_bal = net if net > 0 else ZERO
        credit_bal = -net if net < 0 else ZERO
        rows.append({
            "account_number": acc.account_number, "name": acc.name,
            "account_type": acc.account_type,
            "debit": str(debit_bal), "credit": str(credit_bal),
        })
        tot_d += debit_bal
        tot_c += credit_bal
    return {"rows": rows, "total_debit": str(tot_d), "total_credit": str(tot_c),
            "balanced": tot_d == tot_c}


def _net_profit(tenant, as_of=None) -> Decimal:
    total = ZERO
    for acc, d, c in _balances(tenant, as_of):
        if acc.account_type == "revenue":
            total += _signed(acc, d, c)
        elif acc.account_type == "expense":
            total -= _signed(acc, d, c)
    return total


def profit_loss(tenant, as_of=None) -> dict:
    revenue, expense = [], []
    tr, te = ZERO, ZERO
    for acc, d, c in _balances(tenant, as_of):
        bal = _signed(acc, d, c)
        if bal == 0:
            continue
        if acc.account_type == "revenue":
            revenue.append({"account_number": acc.account_number, "name": acc.name, "amount": str(bal)})
            tr += bal
        elif acc.account_type == "expense":
            expense.append({"account_number": acc.account_number, "name": acc.name, "amount": str(bal)})
            te += bal
    return {"revenue": revenue, "expense": expense,
            "total_revenue": str(tr), "total_expense": str(te), "net_profit": str(tr - te)}


def balance_sheet(tenant, as_of=None) -> dict:
    assets, liabilities, equity = [], [], []
    ta, tl, teq = ZERO, ZERO, ZERO
    for acc, d, c in _balances(tenant, as_of):
        bal = _signed(acc, d, c)
        if bal == 0:
            continue
        row = {"account_number": acc.account_number, "name": acc.name, "amount": str(bal)}
        if acc.account_type == "asset":
            assets.append(row); ta += bal
        elif acc.account_type == "liability":
            liabilities.append(row); tl += bal
        elif acc.account_type == "equity":
            equity.append(row); teq += bal
    # current-period earnings flow into equity (retained earnings) so the sheet balances
    earnings = _net_profit(tenant, as_of)
    if earnings != 0:
        equity.append({"account_number": "—", "name": "Current-period earnings", "amount": str(earnings)})
        teq += earnings
    return {
        "assets": assets, "liabilities": liabilities, "equity": equity,
        "total_assets": str(ta), "total_liabilities": str(tl), "total_equity": str(teq),
        "total_liabilities_equity": str(tl + teq),
        "balanced": ta == (tl + teq),
    }
