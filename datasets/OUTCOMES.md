# Green-card OUTCOMES datasets (successful vs unsuccessful)

Approvals/denials of green-card applications. "Success" = Certified / Approved / Issued;
"unsuccessful" = Denied / Refused / Withdrawn. All are U.S. government works (public domain)
unless noted. Most official outcome data is PDF or large xlsx behind dynamic pages, so this
catalog vendors the machine-readable summary it can verify and links the rest.

## Vendored
| Path | What | Coverage | Source |
|---|---|---|---|
| `outcomes_perm/` | PERM labor-cert outcomes (Certified/Denied/Withdrawn), overall + by country | FY2024 (92k cases) | DOL OFLC |

## Linked (authoritative outcome data)
- **USCIS - All Application & Petition Data by Form** (Received/Approved/Denied/Pending, quarterly). https://www.uscis.gov/tools/reports-and-studies/immigration-and-citizenship-data
- **USCIS Form I-485** (Adjustment of Status = the green card itself) approvals/denials by category & country (xlsx). same page
- **USCIS Form I-140** (employment petition) receipts & status by preference & country (PDF). https://www.uscis.gov/sites/default/files/document/data/i140_rec_by_class_country_fy2023_%20q4.pdf
- **USCIS Form I-130** (family petition) approvals/denials. same data page
- **USCIS Form I-526 / I-829** (EB-5 investor) outcomes. same data page
- **DOS Report of the Visa Office** - immigrant visa issuances (success) AND refusal tables. https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics/annual-reports.html
- **DOL OFLC disclosure (raw, case-level)** - PERM + H-1B LCA, full Certified/Denied (~76MB/qtr xlsx). https://www.dol.gov/agencies/eta/foreign-labor/performance
- **Kaggle: US Permanent Visa Applications** - 374k PERM decisions, CSV (login required). https://www.kaggle.com/datasets/jboysen/us-perm-visas
- **Kaggle: Green Card & H1B 2014-2018** (login required). https://www.kaggle.com/datasets/jonamjar/green-card-h1b-20142018
- **TRAC Syracuse** - denial-rate analysis. https://trac.syr.edu/
- **EOIR (immigration courts)** - relief grant/denial (asylum, cancellation). https://www.justice.gov/eoir/workload-and-adjudication-statistics

Verify current figures at the official source before relying on them.
