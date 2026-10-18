"""
Named date-range presets → concrete (from, to) dates. Pure, timezone-aware date math
so the frontend never re-derives "last 7 days" etc. `to` is inclusive.
Week starts Monday (ISO).
"""
from datetime import date, timedelta

# preset key -> human label (order preserved for the UI)
PRESETS: dict[str, str] = {
    "today": "Today",
    "yesterday": "Yesterday",
    "this_week": "This week",
    "last_week": "Last week",
    "last_7_days": "Last 7 days",
    "last_30_days": "Last 30 days",
    "this_month": "This month",
    "last_month": "Last month",
    "this_year": "This year",
}


def resolve(preset: str, today: date) -> tuple[date, date] | None:
    """Return (from_date, to_date) inclusive for a preset, or None if unknown."""
    if preset == "today":
        return today, today
    if preset == "yesterday":
        y = today - timedelta(days=1)
        return y, y
    if preset == "this_week":
        start = today - timedelta(days=today.weekday())     # Monday
        return start, today
    if preset == "last_week":
        this_mon = today - timedelta(days=today.weekday())
        start = this_mon - timedelta(days=7)
        return start, start + timedelta(days=6)
    if preset == "last_7_days":
        return today - timedelta(days=6), today             # incl. today = 7 days
    if preset == "last_30_days":
        return today - timedelta(days=29), today            # incl. today = 30 days
    if preset == "this_month":
        return today.replace(day=1), today
    if preset == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return last_prev.replace(day=1), last_prev
    if preset == "this_year":
        return today.replace(month=1, day=1), today
    return None


def all_presets(today: date) -> list[dict]:
    out = []
    for key, label in PRESETS.items():
        rng = resolve(key, today)
        if rng:
            out.append({"key": key, "label": label, "from": rng[0].isoformat(), "to": rng[1].isoformat()})
    return out
