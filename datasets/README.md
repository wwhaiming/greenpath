# GreenPath datasets

Public datasets relevant to U.S. employment-based green-card guidance.

## Visa Bulletin history (employment-based)

Monthly Department of State Visa Bulletin **final-action dates** and derived **wait times**, by chargeability country and EB preference level. The core signal for green-card timeline guidance.

| File | Country | Rows | Bulletin range |
|---|---|---|---|
| `visa_bulletin/china_eb_backlog.csv` | China | 924 | 2005-04-01 to 2025-12-01 |
| `visa_bulletin/india_eb_backlog.csv` | India | 976 | 2003-10-01 to 2025-12-01 |
| `visa_bulletin/mexico_eb_backlog.csv` | Mexico | 976 | 2003-10-01 to 2025-12-01 |
| `visa_bulletin/philippines_eb_backlog.csv` | Philippines | 968 | 2003-10-01 to 2025-12-01 |
| `visa_bulletin/row_eb_backlog.csv` | Rest of world (all other countries) | 468 | 2016-04-01 to 2025-12-01 |

**Columns:** `EB_level` (1=EB-1, 2=EB-2, 3=EB-3 ...), `final_action_dates` (current priority date), `visa_bulletin_date` (bulletin month), `visa_wait_time` (years).

- Source: [DavidBellamy/visa_dates](https://github.com/DavidBellamy/visa_dates), scraped from the [U.S. Dept. of State Visa Bulletin](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html).
- The underlying Visa Bulletin is a U.S. government work (public domain). Use `download.sh` to refresh; `load.py` for a combined country-tagged frame.

## Additional public immigration data sources

Relevant government datasets (large / non-CSV; linked rather than vendored here):

- **DHS OHSS Yearbook of Immigration Statistics** - lawful permanent residents by category/country/year (xlsx). https://ohss.dhs.gov/topics/immigration/yearbook
- **DOL OFLC disclosure data** - PERM labor certification, PWD, H-1B LCA (xlsx). https://www.dol.gov/agencies/eta/foreign-labor/performance
- **USCIS processing times** - by form and field office. https://egov.uscis.gov/processing-times/
- **USCIS immigration & citizenship data** (I-485/I-140 reports). https://www.uscis.gov/records/electronic-reading-room

All are U.S. government works (public domain). Predictions/guidance built on them are educational, not legal advice.


## Derived: live wait estimator

Generated from the Visa Bulletin CSVs by `load.py`:

- **`visa_waits.json`** — latest estimated wait (years) + current priority date per country and EB level, plus a yearly EB-2/EB-3 trend. Regenerate after `download.sh` with the snippet in `load.py`.
- **`wait-estimator.html`** — a self-contained widget that reads `visa_waits.json`: pick country + EB category, see the estimated wait, current priority date, and a trend chart. Open it directly or embed it in the app.

## Large / linked-only sources

- **DOL OFLC PERM disclosure data** is ~76 MB per quarter (xlsx) — not vendored here. Download: https://www.dol.gov/agencies/eta/foreign-labor/performance
- **DHS OHSS Yearbook** tables are xlsx behind the yearbook pages: https://ohss.dhs.gov/topics/immigration/yearbook
