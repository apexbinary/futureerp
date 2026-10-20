"""Shared aging buckets for AR/AP open items (current, 1-30, 31-60, 61-90, 90+)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

ZERO = Decimal("0.00")
BUCKETS = ["current", "b1", "b2", "b3", "b4"]
BUCKET_LABELS = {"current": "Current", "b1": "1-30", "b2": "31-60", "b3": "61-90", "b4": "90+"}


def bucket_of(due: date | None, as_of: date) -> str:
    days = (as_of - due).days if due else 0
    if days <= 0:
        return "current"
    if days <= 30:
        return "b1"
    if days <= 60:
        return "b2"
    if days <= 90:
        return "b3"
    return "b4"


def build_aging(entries: list[dict], as_of: date | None = None) -> dict:
    """entries: [{party_id, party_name, due_date, outstanding}] → aging grid by party."""
    as_of = as_of or date.today()
    by_party: dict = {}
    totals = {k: ZERO for k in [*BUCKETS, "total"]}
    for e in entries:
        amt = e["outstanding"]
        if amt <= 0:
            continue
        b = bucket_of(e["due_date"], as_of)
        row = by_party.setdefault(
            e["party_id"],
            {"party_id": e["party_id"], "party": e["party_name"], **{k: ZERO for k in [*BUCKETS, "total"]}},
        )
        row[b] += amt
        row["total"] += amt
        totals[b] += amt
        totals["total"] += amt

    rows = []
    for r in sorted(by_party.values(), key=lambda x: str(x["party"])):
        rows.append({
            "party_id": r["party_id"], "party": r["party"],
            **{k: str(r[k]) for k in [*BUCKETS, "total"]},
        })
    return {
        "as_of": as_of.isoformat(),
        "labels": BUCKET_LABELS,
        "rows": rows,
        "totals": {k: str(v) for k, v in totals.items()},
    }
