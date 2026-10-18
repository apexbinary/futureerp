"""
Tax computation — the determination engine.

compute_tax(slab, location_code, base) reads the dynamic TaxRate rows by location code.
determine_region(supplier_state, customer_state) returns the location code ("intra"/"inter").
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from .models import TaxRate, TaxRateSlab

INTRA = "intra"
INTER = "inter"


@dataclass
class TaxLine:
    component_id: str
    component_code: str
    percentage: Decimal
    amount: Decimal


def determine_region(supplier_state: str, customer_state: str) -> str:
    a = (supplier_state or "").strip().lower()
    b = (customer_state or "").strip().lower()
    return INTRA if a and b and a == b else INTER


def _round(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_tax(slab: TaxRateSlab, location_code: str, base_amount) -> list[TaxLine]:
    base = Decimal(str(base_amount))
    rates = (
        TaxRate.objects.filter(slab=slab, location__code=location_code)
        .select_related("component")
        .order_by("component__sequence", "component__code")
    )
    out: list[TaxLine] = []
    for r in rates:
        out.append(
            TaxLine(
                component_id=str(r.component_id),
                component_code=r.component.code,
                percentage=r.percentage,
                amount=_round(base * r.percentage / Decimal("100")),
            )
        )
    return out


def preview_tax(slab: TaxRateSlab, supplier_state: str, customer_state: str, base_amount) -> dict:
    region = determine_region(supplier_state, customer_state)
    lines = compute_tax(slab, region, base_amount)
    total = sum((ln.amount for ln in lines), Decimal("0.00"))
    base = Decimal(str(base_amount))
    return {
        "slab": slab.code,
        "region_type": region,
        "base_amount": str(_round(base)),
        "components": [
            {"component": ln.component_code, "percentage": str(ln.percentage), "amount": str(ln.amount)}
            for ln in lines
        ],
        "total_tax": str(_round(total)),
        "grand_total": str(_round(base + total)),
    }
