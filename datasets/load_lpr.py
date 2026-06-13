#!/usr/bin/env python3
"""Loader for the by-country immigration datasets (LPR green cards + nonimmigrant)."""
import glob, os
from pathlib import Path
import pandas as pd
HERE = Path(__file__).resolve().parent

def _load(folder, prefix):
    frames=[]
    for f in sorted((HERE/folder).glob(prefix+"*.csv")):
        year=int(os.path.basename(f)[len(prefix):len(prefix)+4])
        df=pd.read_csv(f); df["year"]=year
        frames.append(df)
    out=pd.concat(frames, ignore_index=True)
    return out[out["countryName"].notna() & (out["countryName"].astype(str).str.strip()!="")].reset_index(drop=True)

def load_lpr():
    """Green cards by country/year/category (immediateRelative, familySponsored, employmentBased, refugeeAsylee, diversityLottery, otherLPR, total)."""
    return _load("lpr_by_country","lpr")

def load_ni():
    """Nonimmigrant admissions by country/year/class."""
    return _load("ni_by_country","ni")

if __name__=="__main__":
    lpr=load_lpr()
    print(f"LPR: {len(lpr)} rows, {lpr['countryName'].nunique()} countries, {lpr['year'].min()}-{lpr['year'].max()}")
    top=lpr[lpr.year==lpr.year.max()].nlargest(8,"total")[["countryName","employmentBased","familySponsored","total"]]
    print("Top countries by green cards ("+str(int(lpr.year.max()))+"):")
    print(top.to_string(index=False))
