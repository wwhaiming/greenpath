#!/usr/bin/env python3
"""
Loader for the GreenPath Visa Bulletin datasets.

Combines the per-country employment-based green-card backlog CSVs into one tidy,
country-tagged DataFrame, with dates parsed.

    from load import load_visa_bulletin
    df = load_visa_bulletin()        # columns: country, EB_level, final_action_date,
                                     #          bulletin_date, wait_years

CLI:
    python load.py                   # summary by country
    python load.py india             # head + latest waits for one country
"""
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
VB = HERE / "visa_bulletin"
COUNTRY = {"china": "China", "india": "India", "mexico": "Mexico",
           "philippines": "Philippines", "row": "Rest of world"}


def load_visa_bulletin():
    frames = []
    for f in sorted(VB.glob("*_eb_backlog.csv")):
        key = f.name.split("_")[0]
        df = pd.read_csv(f)
        df["country"] = COUNTRY.get(key, key)
        frames.append(df)
    if not frames:
        raise FileNotFoundError(
            f"No *_eb_backlog.csv files found in {VB}. "
            "Run datasets/download.sh to fetch the Visa Bulletin CSVs first.")
    df = pd.concat(frames, ignore_index=True)
    df = df.rename(columns={"final_action_dates": "final_action_date",
                            "visa_bulletin_date": "bulletin_date",
                            "visa_wait_time": "wait_years"})
    df["final_action_date"] = pd.to_datetime(df["final_action_date"], errors="coerce")
    df["bulletin_date"] = pd.to_datetime(df["bulletin_date"], errors="coerce")
    df["wait_years"] = pd.to_numeric(df["wait_years"], errors="coerce")
    cols = ["country", "EB_level", "final_action_date", "bulletin_date", "wait_years"]
    return df[cols].sort_values(["country", "EB_level", "bulletin_date"]).reset_index(drop=True)


def _summary():
    df = load_visa_bulletin()
    print(f"{len(df):,} rows across {df['country'].nunique()} countries, "
          f"{df['bulletin_date'].min().date()} to {df['bulletin_date'].max().date()}\n")
    latest = df.sort_values("bulletin_date").groupby(["country", "EB_level"]).tail(1)
    print("Latest estimated wait (years) by country / EB level:")
    piv = latest.pivot_table(index="country", columns="EB_level", values="wait_years")
    print(piv.round(1).to_string())


if __name__ == "__main__":
    if len(sys.argv) > 1:
        c = sys.argv[1].lower()
        df = load_visa_bulletin()
        sub = df[df["country"].str.lower().str.startswith(c)]
        if sub.empty:
            print(f"no country matching {c!r}; options: {sorted(set(df['country']))}")
        else:
            print(sub.tail(10).to_string(index=False))
    else:
        _summary()
