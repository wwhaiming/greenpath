# GreenPath — Trustworthy Immigration Data Sources

Every entry below was **live-verified** (HTTP fetch / source inspection) by a
33-agent research pass on 2026-06-13. Status legend:

- CONFIRMED LIVE — fetched real bytes/JSON this session
- GATED — works, but needs a key, onboarding, browser User-Agent, or has anti-bot blocking
- CAUTION — Terms-of-Service / scraping / reliability risk

**Key fact for this project:** you do **not** need to ask anyone for the
authoritative grounding data. The legal rules, forms, fees, Visa Bulletin, and
DOL wage data are all public download/API. "Who to ask" (bottom) only matters
for curated/aggregated data or expert validation.

---

## Tier 1 — RAG grounding corpus (highest-impact data for GreenPath)

Grounds the **pathway classifier**, **stage Q&A**, and **document/RFE review**
in real law instead of model memory.

| Source | Access | URL | Status |
|---|---|---|---|
| **eCFR Versioner API — Title 8 (8 CFR)** | public REST API (JSON/XML) | `https://www.ecfr.gov/developers/documentation/api/v1` | CONFIRMED LIVE — returned `{"identifier":"8","label":"Title 8—Aliens and Nationality"}` |
| **govinfo API — US Code Title 8 (INA)** | public REST API (free api.data.gov key) | `https://api.govinfo.gov/docs/` | CONFIRMED LIVE |
| **uscode.house.gov bulk — Title 8** | bulk download (USLM XML / XHTML / PDF) | `https://uscode.house.gov/download/download.shtml` | CONFIRMED LIVE — current through PL 119-95 |
| **USCIS Form Instruction PDFs** | static PDF (browser User-Agent) | `https://www.uscis.gov/sites/default/files/document/forms/{form}instr.pdf` | CONFIRMED LIVE — i-485instr.pdf 689KB, i-130.pdf 730KB |
| **USCIS G-1055 Fee Schedule** | static PDF (parse to table) | `https://www.uscis.gov/sites/default/files/document/forms/g-1055.pdf` | CONFIRMED LIVE — 200, application/pdf, ed. 05/29/26 |
| **USCIS Policy Manual** | scrape (HTML) | `https://www.uscis.gov/policy-manual` | CONFIRMED LIVE — AFM retired/folded in |

> `uscis.gov` HTML index pages sit behind a WAF and 403 a default fetcher, but
> static `/sites/default/files/document/forms/*.pdf` files download fine **with a
> browser User-Agent** (see `scripts/fetch_corpus.sh`).

## Tier 2 — Visa Bulletin (priority dates)

| Source | Access | URL | Status |
|---|---|---|---|
| **DOS Visa Bulletin (official)** | HTML index + monthly PDF | `https://travel.state.gov/.../visa-bulletin.html` , `.../Bulletins/visabulletin_June2026.pdf` | CONFIRMED LIVE — PDF 331KB |
| **vyakunin/visa_bulletin** (powers visa-bulletin.us) | third-party parsed data (GitHub) | `https://github.com/vyakunin/visa_bulletin` | CONFIRMED LIVE — best ready-made *structured* bulletin data |
| **DOS Visa Statistics** | bulk download (PDF/XLSX) | `https://travel.state.gov/.../visa-statistics.html` | CONFIRMED LIVE |

## Tier 3 — Employment-based (PERM / LCA / prevailing wage)

| Source | Access | URL | Status |
|---|---|---|---|
| **DOL OFLC Performance Data (disclosure files)** | bulk download (XLSX + layouts) | `https://www.dol.gov/agencies/eta/foreign-labor/performance` | CONFIRMED LIVE |
| **OFLC Wage Data (FLAG)** | bulk download (ZIP) | `https://flag.dol.gov/wage-data/wage-data-downloads` | CONFIRMED LIVE — OFLC_Wages_2025-26.zip 11MB |
| **Kaggle — US PERM Visas (~374k decisions)** | third-party CSV | `https://www.kaggle.com/jboysen/us-perm-visas` | GATED — easiest CSV start; verify vs DOL |
| **Kaggle — H1B LCA 2020-2024** | third-party CSV | `https://www.kaggle.com/datasets/zongaobian/h1b-lca-disclosure-data-2020-2024` | GATED |

## Tier 4 — Aggregate stats & context

| Source | Access | URL | Status |
|---|---|---|---|
| **DHS OHSS Yearbook of Immigration Statistics** | bulk download | `https://ohss.dhs.gov/topics/immigration/yearbook` | CONFIRMED LIVE |
| **USCIS Immigration & Citizenship Data + Employer Data Hub** | bulk (XLSX/CSV) | `https://www.uscis.gov/tools/reports-and-studies/immigration-and-citizenship-data` | CONFIRMED LIVE — H-1B hub CSV 2.2MB |
| **TRAC Immigration (Syracuse)** | scrape / reports | `https://tracreports.org/` | CONFIRMED LIVE |
| **Federal Register API** | public REST API | `https://www.federalregister.gov/developers/documentation/api/v1` | CONFIRMED LIVE — rule/fee changes + effective dates |

## Tier 5 — Live case-specific (gated; nice-to-have, not required)

| Source | Access | URL | Reality |
|---|---|---|---|
| **USCIS Case Status API (Torch)** | OAuth2 public API | `https://developer.uscis.gov/api/case-status` | GATED — NOT retired. Sandbox immediate; **production needs ~5 days sandbox traffic + emailed request + live demo (multi-week)**. Keep off the hackathon critical path. |
| **USCIS Processing Times JSON** | undocumented endpoint | `https://egov.uscis.gov/processing-times/api/processingtime/{form}/{office}` | GATED — exists but Cloudflare 403s server-side calls. Use a daily mirror or published ranges. |

## Tier 6 — Community (interview flavor only — NOT authoritative)  [CAUTION]

- **VisaJourney** timelines/forums — `https://www.visajourney.com/timeline/` (403 bot-block)
- **Reddit r/immigration, r/USCIS** — live HTML; official access via "Reddit for
  Researchers" (weeks; academic-skewed; a high-schooler may not qualify)
- **Trackitt** — reachability/ToS unverified

Scraping these likely violates ToS. Use only for *interview-simulator realism*,
clearly flagged as anecdotal — never for eligibility, fees, or timelines.

---

## Who to ask for data (ranked by reply speed, for a student)

1. **MPI — Migration Policy Institute** — `data@migrationpolicy.org` — **fastest +
   most student-friendly** (a few business days). Dedicated data inbox, public-
   education mission. **Best single email target.**
2. **ILRC / CLINIC** — days to ~2 weeks; may redirect you to free public resources.
3. **University immigration law clinics** (Cornell 1L Immigration Clinic,
   Georgetown CALS) — email a *named* faculty director; variable, slow in summer.
4. **AILA / NILC** — slow/uncertain for a non-member student; research is
   member-only. A press/research framing routes faster.
5. **USCIS FOIA** — slow (weeks–months). Check the **Electronic Reading Room
   first** (instant): `https://www.uscis.gov/records/electronic-reading-room`.

**Honest take:** for GreenPath, grab Tier 1–3 public data yourself. Only email
MPI if you want curated/aggregated stats or a credibility quote for the demo.

---

## How this wires into GreenPath

- The app already does **link-grounding + citations** (`USCIS_SOURCES` registry
  in `public/index.html`) — now extended with `8cfr`, `policy`, `perm`,
  `feecalc`. The model grounds claims in these and cites them.
- For deeper **retrieval RAG** (optional, larger build): download Tier-1 corpora
  with `scripts/fetch_corpus.sh`, chunk the form-instruction + 8 CFR text, embed
  them, and inject top-k chunks into each feature's system prompt. Keep volatile
  numbers (fees/dates) as *links to verify*, never hardcoded.
