#!/usr/bin/env python3
"""
Per-country green-card wait forecaster (real model trained on the Visa Bulletin
time series in datasets/visa_bulletin/).

For each country + EB level it fits the recent advancement RATE of the final-action
("current") priority date -- how many days of priority date the queue clears per
calendar year -- with a linear regression over a recent window. From that rate it
projects when a given priority date will become current.

NOTE: Visa Bulletin movement is erratic (retrogressions, surges). This is a rough
trend extrapolation, not a guarantee; low R^2 / non-positive slope => "no reliable
forecast". Output is heavily caveated and meant to be explained by the AI, never
treated as legal advice.

Writes datasets/forecasts.json (precomputed rates + sample projections). The runtime
projection math lives in visa_data.py (stdlib) so the server needs no ML deps.
"""
import json
import os
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
VB = HERE / "datasets" / "visa_bulletin"
OUT = HERE / "datasets" / "forecasts.json"
COUNTRY = {"china": "China", "india": "India", "mexico": "Mexico",
           "philippines": "Philippines", "row": "Rest of world"}
WINDOW_YEARS = 4


def load():
    frames = []
    for f in sorted(VB.glob("*_eb_backlog.csv")):
        key = os.path.basename(f).split("_")[0]
        df = pd.read_csv(f)
        df["country"] = COUNTRY.get(key, key)
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df["pd"] = pd.to_datetime(df["final_action_dates"], errors="coerce")
    df["bull"] = pd.to_datetime(df["visa_bulletin_date"], errors="coerce")
    return df.dropna(subset=["pd", "bull"])


def fit(g):
    """Fit recent advancement rate (priority-date days cleared per calendar year)."""
    g = g.sort_values("bull")
    if len(g) < 8:
        return None
    cutoff = g["bull"].max() - pd.DateOffset(years=WINDOW_YEARS)
    w = g[g["bull"] >= cutoff]
    if len(w) < 8:
        w = g.tail(36)
    x = (w["bull"] - w["bull"].min()).dt.days.to_numpy(dtype=float)
    y = (w["pd"] - w["pd"].min()).dt.days.to_numpy(dtype=float)
    if x.max() == 0:
        return None
    slope, intercept = np.polyfit(x, y, 1)          # PD-days per real-day
    pred = slope * x + intercept
    ss_res = float(((y - pred) ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum()) or 1.0
    r2 = 1 - ss_res / ss_tot
    latest = g.iloc[-1]
    return {"slope_per_day": round(float(slope), 4),
            "advance_days_per_year": round(float(slope) * 365.25, 1),
            "r2": round(float(r2), 2),
            "latest_pd": latest["pd"].date().isoformat(),
            "latest_bulletin": latest["bull"].date().isoformat()}


def status(slope):
    if slope >= 0.95:
        return "keeping pace (queue clears about as fast as time passes)"
    if slope > 0.05:
        return "advancing slowly (backlog growing)"
    return "stalled or retrogressing (no reliable forecast)"


def project_years(rate, priority_date):
    """Years until `priority_date` (ISO str) becomes current, or None if indeterminate."""
    slope = rate["slope_per_day"]
    if slope <= 0.05:
        return None
    latest = date.fromisoformat(rate["latest_pd"])
    target = date.fromisoformat(priority_date)
    gap_days = (target - latest).days
    if gap_days <= 0:
        return 0.0
    return round((gap_days / slope) / 365.25, 1)


def main():
    df = load()
    latest_bulletin = df["bull"].max().date().isoformat()
    out = {"_meta": {
        "source": "DOS Visa Bulletin history (datasets/visa_bulletin/)",
        "method": f"linear fit of final-action-date vs bulletin-date over the last {WINDOW_YEARS} years",
        "latest_bulletin": latest_bulletin,
        "caveat": "Rough trend extrapolation. Visa Bulletin movement is erratic; "
                  "non-positive slope or low R^2 means no reliable forecast. Educational, not legal advice."},
        "countries": {}}
    for country, gc in df.groupby("country"):
        out["countries"][country] = {}
        for eb, g in gc.groupby("EB_level"):
            r = fit(g)
            if not r:
                continue
            ebk = f"EB{int(eb)}"
            r["status"] = status(r["slope_per_day"])
            sample_pd = (df["bull"].max() - pd.DateOffset(years=5)).date().isoformat()
            r["sample_projection"] = {"for_priority_date": sample_pd,
                                      "est_years_to_current": project_years(r, sample_pd)}
            out["countries"][country][ebk] = r
    OUT.write_text(json.dumps(out, indent=2))
    print(f"wrote {OUT.relative_to(HERE)} (latest bulletin {latest_bulletin})")
    for c, lv in out["countries"].items():
        for ebk, r in lv.items():
            sp = r["sample_projection"]["est_years_to_current"]
            sp = f"{sp}yr" if sp is not None else "n/a"
            print(f"  {c:14s} {ebk}: {r['advance_days_per_year']:>7} PD-days/yr  r2={r['r2']:>5}  "
                  f"5yr-old PD -> {sp:>6}  [{r['status'].split('(')[0].strip()}]")


if __name__ == "__main__":
    main()
