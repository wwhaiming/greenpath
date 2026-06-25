"""
Visa Bulletin grounding for the GreenPath AI.

Turns datasets/visa_waits.json (current waits + history) and datasets/forecasts.json
(recent advancement rates + projections from forecast.py) into a compact factual brief
injected into the AI system prompts, so answers about timelines / wait times / priority
dates / "when will I be current" use REAL data and trends, not generic guesses.

Stdlib only -- safe to import anywhere (server needs no ML deps).
"""
import json
from datetime import date
from pathlib import Path

_DIR = Path(__file__).resolve().parent / "datasets"
_JSON = _DIR / "visa_waits.json"
_FC = _DIR / "forecasts.json"
_ORDER = ["India", "China", "Mexico", "Philippines", "Rest of world"]

# Single shared stall threshold so the brief and the projection tool can never
# contradict. STALL_SLOPE is PD-days cleared per real-day (used on slope_per_day);
# STALL_DAYS_PER_YEAR is the same threshold expressed per year (used on
# advance_days_per_year). forecast.py imports both. A queue at or below the
# threshold is treated as stalled/retrogressing with no reliable forecast.
STALL_SLOPE = 0.05
STALL_DAYS_PER_YEAR = STALL_SLOPE * 365.25  # ~18.3 days/yr


def _load(path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _trend_note(trend):
    """Describe what happened to the backlog over time from a [[year, wait], ...] series."""
    pts = trend.get("EB2") or trend.get("EB3") or []
    if len(pts) < 2:
        return ""
    (y0, v0), (y1, v1) = pts[0], pts[-1]
    if v1 > v0 + 0.5:
        return f" Backlog GREW from ~{v0}yr in {y0} to ~{v1}yr in {y1}."
    if v1 < v0 - 0.5:
        return f" Backlog shrank from ~{v0}yr in {y0} to ~{v1}yr in {y1}."
    return f" Roughly stable (~{v1}yr) since {y0}."


def project_current(country, eb, priority_date):
    """
    Estimate years until `priority_date` (YYYY-MM-DD) becomes current for a given
    country + EB level, using the fitted advancement rate in forecasts.json.
    Returns a dict (status, years, latest_pd, r2) or None if unknown.
    Intended for use as an AI tool / by app code.
    """
    eb = eb if str(eb).startswith("EB") else "EB" + str(eb)
    fc = _load(_FC).get("countries", {}).get(country, {}).get(eb)
    if not fc:
        return None
    slope = fc.get("slope_per_day", 0)
    if slope <= STALL_SLOPE:
        return {"status": fc.get("status"), "years": None,
                "note": "queue has stalled or retrogressed - no reliable forecast"}
    try:
        latest = date.fromisoformat(fc["latest_pd"])
        target = date.fromisoformat(priority_date)
    except Exception:
        return None
    gap = (target - latest).days
    years = 0.0 if gap <= 0 else round((gap / slope) / 365.25, 1)
    return {"status": fc.get("status"), "years": years,
            "latest_pd": fc["latest_pd"], "r2": fc.get("r2")}


def _forecast_line(country, fc_countries):
    """One compact forecast sentence per country from forecasts.json."""
    f = fc_countries.get(country, {})
    parts = []
    for eb in ("EB1", "EB2", "EB3"):
        r = f.get(eb)
        if not r:
            continue
        rate = r.get("advance_days_per_year", 0)
        if rate <= STALL_DAYS_PER_YEAR:
            parts.append(f"{eb} no reliable forecast (stalled/retrogressing)")
        else:
            parts.append(f"{eb} advancing ~{rate:.0f} priority-date days/yr")
    return ("  forecast: " + "; ".join(parts) + ".") if parts else ""


def build_brief(max_chars=2600):
    """Return a concise grounding brief, or '' if the dataset is unavailable."""
    data = _load(_JSON)
    countries = data.get("countries", {})
    if not countries:
        return ""
    fc_countries = _load(_FC).get("countries", {})
    keys = [k for k in _ORDER if k in countries] + [k for k in countries if k not in _ORDER]
    lines = [
        "REAL VISA BULLETIN DATA (U.S. Department of State, employment-based green cards).",
        "When the user asks about timelines, wait times, priority dates, or 'when will I be current', "
        "USE these actual figures, trends, and forecasts. Forecasts are rough extrapolations of recent "
        "movement -- 'no reliable forecast' means the queue stalled or retrogressed. Always say the data "
        "comes from the historical Visa Bulletin, can change monthly, and to verify at travel.state.gov. "
        "This is general information, not legal advice.",
    ]
    for c in keys:
        rec = countries[c]
        lv = rec.get("levels", {})
        parts = []
        for eb in ("EB1", "EB2", "EB3", "EB4"):
            d = lv.get(eb)
            if d and d.get("wait_years") is not None:
                pd = d.get("priority_date") or "?"
                parts.append(f"{eb} ~{d['wait_years']}yr (priority date {pd})")
        if not parts:
            continue
        note = _trend_note(rec.get("trend", {}))
        lines.append(f"- {c} (bulletin {rec.get('bulletin_date', '?')}): " + "; ".join(parts) + "." + note)
        fline = _forecast_line(c, fc_countries)
        if fline:
            lines.append(fline)
    brief = "\n".join(lines)
    if len(brief) <= max_chars:
        return brief
    # Truncate on a line boundary so no partial factual line reaches the LLM prompt.
    cut = brief.rfind("\n", 0, max_chars)
    return brief[:cut] if cut > 0 else brief[:max_chars]


if __name__ == "__main__":
    print(build_brief())
    print("\n--- sample projection: India EB3, priority date 2015-01-01 ---")
    print(project_current("India", "EB3", "2015-01-01"))
    print("--- sample projection: India EB2 (stalled) ---")
    print(project_current("India", "EB2", "2015-01-01"))
