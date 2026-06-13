# GreenPath data sources (country-level immigration)

Public datasets correlated with U.S. green-card / immigration guidance, organized by
whether they are **vendored** in this repo or **linked** (too large / PDF / behind dynamic pages).
GreenPath is U.S.-focused, so "all countries" = U.S. immigration broken down by country of
origin / chargeability. All underlying data are U.S. government works (public domain) unless noted.

## Vendored in this repo

| Folder | What | Coverage | Source |
|---|---|---|---|
| `visa_bulletin/` | Employment-based priority dates + wait times | China, India, Mexico, Philippines, ROW; 2003-2025 | DOS Visa Bulletin (via DavidBellamy/visa_dates) |
| `lpr_by_country/` | Green cards granted by country & category (family, employment, refugee/asylee, diversity, immediate-relative) | ~200 countries; FY2005-2016 | DHS Yearbook (via braxex/immigration-visualizer) |
| `ni_by_country/` | Nonimmigrant (temporary) admissions by country & class | ~200 countries; FY2005-2016 | DHS Yearbook (via braxex/immigration-visualizer) |

Loaders: `load.py` (visa bulletin), `load_lpr.py` (LPR + NI). Derived: `visa_waits.json`, `wait-estimator.html`.

## Linked (not vendored - large, PDF, or dynamic)

- **DHS OHSS Yearbook of Immigration Statistics** - authoritative LPR / naturalization / nonimmigrant tables by country of birth, all years (xlsx). https://ohss.dhs.gov/topics/immigration/yearbook
- **DOS Report of the Visa Office** - immigrant & nonimmigrant visa issuances by foreign state of chargeability, annual (PDF/xlsx). https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html
- **DOS Monthly Immigrant Visa Issuances by FSC** (PDF). https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics/immigrant-visa-statistics/monthly-immigrant-visa-issuances.html
- **DOS Diversity Visa (DV) statistics by country** (PDF). https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics/diversity-visa-program-statistics.html
- **USCIS processing times** by form / field office. https://egov.uscis.gov/processing-times/
- **USCIS Immigration & Citizenship Data** (I-485/I-140/I-765 reports). https://www.uscis.gov/tools/reports-and-studies/immigration-and-citizenship-data
- **USCIS naturalizations by field office** (CSV). https://github.com/dovinmu/USCIS-data
- **DOL OFLC disclosure data** - PERM / H-1B LCA / PWD (xlsx, ~76 MB per quarter). https://www.dol.gov/agencies/eta/foreign-labor/performance
- **UN DESA International Migrant Stock** - migrants by origin/destination (xlsx). https://www.un.org/development/desa/pd/content/international-migrant-stock
- **World Bank Global Bilateral Migration** - migration matrices by country. https://datacatalog.worldbank.org/

All figures are for education, not legal advice. Verify current data at the official source.
