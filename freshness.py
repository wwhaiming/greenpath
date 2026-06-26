"""Data-freshness reporting for GreenPath (deterministic, no network, no LLM).

Immigration guidance changes constantly, so the single biggest correctness risk
for an offline, data-grounded app is serving STALE policy/fees/forms/filing
windows. This module turns that risk into a *visible, testable signal*:

  * ``report(today=None)`` returns the age and a ``stale`` flag for every
    critical dataset GreenPath ships, plus an ``any_stale`` / ``any_gate_stale``
    rollup. The frontend renders this as a source-freshness panel; the
    ``/api/freshness`` endpoint exposes it; and ``tests/test_freshness.py`` uses
    it as an automated tripwire (``days_since(retrieved_at) <= max_age_days``).

Two kinds of dataset are tracked, on purpose:

  * ``retrieved_at`` datasets (the curated USCIS/DOS corpus and the legal-aid
    directory) carry the date WE last verified them. We control these, so they
    are part of the hard freshness GATE (``gate: True``): the test fails once
    they age past their threshold, forcing a re-pull.
  * ``content_period`` datasets (the Visa Bulletin history) are published by the
    government on a fixed monthly cadence. We cannot make DOS publish faster, so
    instead of hiding the lag we SURFACE it: the panel shows the bulletin month
    and a ``stale`` flag, but it is not part of the hard CI gate (``gate:
    False``). Where GreenPath and the live bulletin differ, the official source
    controls — and the UI says so.

Pure stdlib so it is safe to import anywhere.
"""
import json
import os
from datetime import date

_HERE = os.path.dirname(os.path.abspath(__file__))
_DATA = os.path.join(_HERE, "datasets")


def _days_since(iso_date, today):
    """Whole days from an ISO 'YYYY-MM-DD' date to ``today`` (a date)."""
    try:
        d = date.fromisoformat(iso_date[:10])
    except (TypeError, ValueError):
        return None
    return (today - d).days


def _load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


# ── Per-dataset extractors. Each returns (as_of_date_iso, detail_dict) or
#    (None, detail_dict) when the dataset/field is missing. ─────────────────────

def _corpus_as_of(data):
    """Oldest retrieved_at across the curated source corpus (a list of entries).
    Using the OLDEST entry means the gate trips as soon as ANY quote goes stale."""
    if not isinstance(data, list) or not data:
        return None, {"entries": 0}
    dates = [e.get("retrieved_at") for e in data if isinstance(e, dict) and e.get("retrieved_at")]
    if not dates:
        return None, {"entries": len(data)}
    return min(dates), {"entries": len(data), "newest_retrieved_at": max(dates)}


def _legal_aid_as_of(data):
    if not isinstance(data, dict):
        return None, {}
    return data.get("retrieved_at"), {"providers": len(data.get("providers", []))}


def _visa_as_of(data):
    """Latest bulletin month across countries (content period, not fetch date)."""
    if not isinstance(data, dict):
        return None, {}
    countries = data.get("countries", {})
    dates = [c.get("bulletin_date") for c in countries.values()
             if isinstance(c, dict) and c.get("bulletin_date")]
    if not dates:
        return None, {}
    return max(dates), {"countries": len(countries)}


# key, label, filename, extractor, max_age_days, kind, gate
_DATASETS = [
    ("uscis_sources", "USCIS / DOS source corpus (RAG citations)",
     "uscis_sources.json", _corpus_as_of, 90, "retrieved_at", True),
    ("legal_aid", "Legal-aid referral directory",
     "legal_aid.json", _legal_aid_as_of, 180, "retrieved_at", True),
    ("visa_bulletin", "Visa Bulletin wait/priority-date history",
     "visa_waits.json", _visa_as_of, 120, "content_period", False),
]


def report(today=None):
    """Compute the freshness of every tracked dataset.

    Returns::

        {
          "as_of": "YYYY-MM-DD",
          "threshold_note": "...",
          "datasets": [
            {"key","label","kind","as_of","days_old","max_age_days",
             "stale","gate","detail"} , ...
          ],
          "any_stale": bool,        # any dataset past its own threshold
          "any_gate_stale": bool,   # any GATED dataset past threshold (CI tripwire)
        }
    """
    today = today or date.today()
    out = []
    any_stale = False
    any_gate_stale = False
    for key, label, fname, extractor, max_age, kind, gate in _DATASETS:
        data = _load_json(os.path.join(_DATA, fname))
        as_of, detail = (None, {}) if data is None else extractor(data)
        days_old = _days_since(as_of, today) if as_of else None
        stale = (days_old is None) or (days_old > max_age)
        if stale:
            any_stale = True
            if gate:
                any_gate_stale = True
        out.append({
            "key": key, "label": label, "kind": kind,
            "as_of": as_of, "days_old": days_old,
            "max_age_days": max_age, "stale": stale, "gate": gate,
            "detail": detail,
        })
    return {
        "as_of": today.isoformat(),
        "threshold_note": (
            "Gated datasets carry the date we last verified them and must stay "
            "within their max age. The Visa Bulletin is published monthly by the "
            "U.S. Dept. of State; its lag is surfaced, not gated. Where GreenPath "
            "and an official source differ, the official source controls."),
        "datasets": out,
        "any_stale": any_stale,
        "any_gate_stale": any_gate_stale,
    }
