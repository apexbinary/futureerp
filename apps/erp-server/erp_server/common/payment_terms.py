import re
from datetime import date, timedelta

_NET_RE = re.compile(r"net\s*(\d+)", re.IGNORECASE)
# A bare number of days, e.g. "30" or "30 days" — matched only when it's the
# entire string, so numbers inside unrelated text (e.g. a GST rate) aren't misread.
_BARE_DAYS_RE = re.compile(r"^\s*(\d+)\s*(?:d(?:ays?)?)?\s*$", re.IGNORECASE)


def due_date_from_terms(baseline: date | None, terms: str | None) -> date | None:
    """Parse a 'Net N' (optionally '2/10 Net 30'-style) or bare "N"/"N days"
    payment term and compute the due date from the baseline date. Returns None
    when there's no baseline or the terms don't match a recognized pattern —
    callers should leave due_date untouched in that case rather than guessing.
    """
    if not baseline or not terms:
        return None
    m = _NET_RE.search(terms) or _BARE_DAYS_RE.match(terms)
    if not m:
        return None
    return baseline + timedelta(days=int(m.group(1)))
