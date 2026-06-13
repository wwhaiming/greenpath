"""
Visa Bulletin grounding for the GreenPath AI.

Turns datasets/visa_waits.json (derived from the Dept. of State Visa Bulletin
history) into a compact factual brief that is injected into the AI system prompts,
so answers about timelines / wait times / priority dates use REAL data and reflect
what actually happened in the backlogs (trends), instead of generic guesses.

Stdlib only -- safe to import anywhere.
"""
import json
from pathlib import Path

_JSON = Path(__file__).resolve().parent / "datasets" / "visa_waits.json"
_ORDER = ["India", "China", "Mexico", "Philippines", "Rest of world"]


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


def build_brief(max_chars=1800):
    """Return a concise grounding brief, or '' if the dataset is unavailable."""
    try:
        data = json.loads(_JSON.read_text())
    except Exception:
        return ""
    countries = data.get("countries", {})
    if not countries:
        return ""
    keys = [k for k in _ORDER if k in countries] + [k for k in countries if k not in _ORDER]
    lines = [
        "REAL VISA BULLETIN DATA (U.S. Department of State, employment-based green cards).",
        "When the user asks about timelines, wait times, priority dates, or backlogs, USE these "
        "actual figures and the trend described. Say they come from historical Visa Bulletin data "
        "and can change monthly; tell the user to verify the current bulletin at travel.state.gov.",
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
    return "\n".join(lines)[:max_chars]


if __name__ == "__main__":
    print(build_brief())
