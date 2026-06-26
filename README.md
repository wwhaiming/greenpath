# GreenPath
AI-powered green card navigation platform \
Created by Whaiming Wang and Gary Zhang for the USAII Global AI Hackathon 2026

## Canonical entry point

`public/index.html` is the single canonical GreenPath app : `server.py` serves it
at `/` (plus the `/api/*` endpoints). Run `python server.py` and open the root URL.

Legacy frontends have been quarantined under [`archive/`](archive/) and are **not**
served or maintained: `archive/src/` (the old React/Vite single-page app),
`archive/index-standalone.html` (self-contained single-file demo), and
`archive/index.html` (old root shell). They are kept for reference only.

## To run in dev mode:
npm install
npm run dev          # Vite on :5173, proxies /api to Flask on :5000
python server.py     # Flask API server

## To build for production (Flask serves everything):
npm run build        # outputs to dist/
python server.py     # serves dist/ + /api/*

## What it does

GreenPath turns the U.S. green card process from a maze of forms and legalese into a guided, plain-language journey. Everything is general information only — never legal advice.

### Features

- **Pathway Finder** — describe your situation in your own words; AI suggests your most likely green card category (family, employment, humanitarian, diversity, investment) with confidence level and next steps
- **Document Review** — paste form entries (I-485, I-130, N-400, ...); AI flags issues that commonly trigger a Request for Evidence before you file
- **Interview Prep** — practice a USCIS-style interview with an AI officer that asks one question at a time and coaches every answer
- **Stage Q&A** — plain-language answers tuned to your pathway and current stage, in any language you ask in
- **Deadline Alerts** — describe your case in a sentence; AI extracts the dates into a visual timeline (offline parser fallback included)
- **Language Tools** — translate, auto-detect language, scan documents (image OCR + PDF), and read results aloud. Capabilities are browser/device dependent; see the tested language matrix (`datasets/language_matrix.json`, served at `GET /api/languages`) for honest per-language OCR / read-aloud / handoff-detection status rather than a blanket "any language" claim
- **Guided Walkthrough & Progress** — stage-by-stage roadmap with interactive checkpoints

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5, single-page app, no router dependency |
| Backend | Flask (Python), serves `dist/` + 5 JSON API endpoints |
| AI | OpenAI `gpt-4o-mini`, strict JSON contracts per feature |
| OCR / PDF | tesseract.js 5 + pdf.js 3 (CDN, in-browser) |
| Speech | Web Speech API (read-aloud) |

## API endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/pathway` | situation description → likely pathway + next steps |
| `POST /api/document-review` | form entries → severity-ranked issue list |
| `POST /api/interview` | running transcript → coaching + next question |
| `POST /api/stage-qa` | pathway + stage + question → plain-language answer |
| `POST /api/chat` | generic completion (date extraction, translation); the single-page frontend routes its AI features through this endpoint |
| `POST /api/handoff-help` | deterministic, location-aware attorney-handoff help: crisis urgency, what to ask, documents to gather, official resources, nearby legal aid (no LLM, no legal advice) |
| `GET /api/freshness` | per-dataset age + staleness for the source-freshness panel (no LLM) |
| `GET /api/privacy` | machine-readable no-retention privacy notice + redaction summary |
| `GET /api/languages` | tested internationalization matrix (OCR / read-aloud / handoff status) |

### Offline demo mode (for live judging)

Run `GREENPATH_DEMO=1 python server.py` to make every AI route return a
deterministic, source-backed, clearly-labeled (`"demo": true`) sample instead of
a 503 when no `OPENAI_API_KEY` is set — so a live demo never shows a broken AI
feature. The attorney-handoff safety stop still runs first. See
[`docs/JUDGE_CHECKLIST.md`](docs/JUDGE_CHECKLIST.md). Production hardening
(Redis limiter, HTTPS, CSP, structured logging, env validation) is documented in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md); privacy posture in
[`docs/PRIVACY.md`](docs/PRIVACY.md).

Every LLM endpoint runs a deterministic, server-side **attorney-handoff** check
first (`handoff.py`). For high-risk situations it returns
`{ "handoff": true, "message": ..., "reasons": [...] }` and **never calls the
model** — the frontend shows a "see a licensed attorney" modal instead of an AI
answer.

## Safety & security

- **Source-backed preparation, not legal advice.** GreenPath helps you prepare
  and understand the process and points to official sources; it is a navigator,
  not a law firm or a substitute for an attorney.
- **Deterministic attorney handoff** (`handoff.py`) on removal/deportation,
  criminal history, fraud/misrepresentation, asylum deadlines, VAWA/U/T visas,
  inadmissibility bars, prior denials, unauthorized work, overstay, and unclear
  status. Reused across all five LLM endpoints and unit-tested for both recall
  and **no false positives** on benign questions.
- **Abuse protection on the paid proxy**: same-origin guard (`403` on cross-site
  browser calls) + in-memory per-IP rate limit (`429` past the cap).
- **Key handling**: the OpenAI key is read from `.env` via `os.environ` and never
  reaches the browser. See [`SECURITY.md`](SECURITY.md) — a key was committed to
  git history in the past and **must be rotated by the owner** (not yet done).

## Tests & evaluation

```bash
pip install -r requirements-dev.txt
npm test            # or: .venv/bin/python -m pytest tests/ -q   (278 tests)
npm run eval        # or: .venv/bin/python evals/eval.py
```

The eval (`evals/eval.py`, ground truth in `evals/cases.json`) scores the
deterministic safety surfaces — handoff precision/recall, the visa estimator,
grounding/no-legal-advice framing, retrieval-by-topic/pathway, and the dataset
freshness gate. It calls **no LLM**, so the number is identical on every run.
Current result: **72/72 = 100.0%**. CI (`.github/workflows/ci.yml`) runs the
tests, the eval, and a gitleaks **secret-scan** job on every push.

### Optional live-LLM eval

`evals/eval.py --live` additionally scores a small golden Q&A set
(`evals/llm_cases.json`) against the real server logic, checking per-case
properties: `must_refuse` (the attorney-handoff stop fires, no AI answer),
`must_cite` (the grounded answer carries ≥1 official-source citation),
`must_not_give_legal_advice`, and `language`. It runs **only when
`OPENAI_API_KEY` is set** and the model is reachable; otherwise the live suite
is skipped and the deterministic gate above is reported unchanged. Without
`--live`, behavior is identical to before. (The language/no-legal-advice checks
are documented heuristics, not a full classifier.)

### Browser E2E (Playwright)

```bash
npm install
npx playwright install --with-deps chromium   # one-time: CI runners ship no browsers
npm run e2e                                    # boots server.py and runs tests/e2e
```

The specs (`tests/e2e/`) boot a local server and assert: a high-risk message
shows the attorney-handoff modal and renders **no AI answer**; benign SPA
navigation works; a cross-origin `POST /api/chat` is **403**; and `/api/health`
returns `ai_configured`. None of these need an API key. Playwright is **not**
part of the required CI job (runners lack browser binaries) — it runs in a
separate, optional `e2e` job that installs browsers first. The default boot
command is `.venv/bin/python server.py`; override with `E2E_SERVER_CMD`.

## Data freshness

The deterministic visa-wait estimate is computed from real U.S. Department of
State Visa Bulletin history **through the December 2025 bulletin** (the latest
available at build time). Cutoffs change monthly — the UI links the official
bulletin and labels its source/date, and where GreenPath and an official source
differ, the official source controls.

A **visible source-freshness panel** (bottom-left of every page, backed by
`GET /api/freshness`) shows the age and staleness of each dataset. An automated
**freshness gate** (`freshness.py` + `tests/test_freshness.py` + the eval) fails
the build if a gated curated dataset (the USCIS/DOS source corpus, the legal-aid
directory) ages past its threshold (90 / 180 days), forcing a re-pull before
stale policy/fees/forms can ship. The Visa Bulletin's monthly lag is surfaced
honestly (flagged stale) rather than gated, since it tracks the government's own
publication cadence.

## Standalone demo

`archive/index-standalone.html` is a self-contained single-file build (scroll-driven SVG stories, animated section emblems, voice read-aloud), kept under `archive/` as legacy. Open it directly in a browser — no install, no server. The canonical app is `public/index.html` served by `server.py`.

## Tips

- macOS: port 5000 is taken by AirPlay Receiver. Run `PORT=5001 python server.py` instead.
- `OPENAI_API_KEY` is read from `.env` (python-dotenv).
- Project structure: `public/index.html` (the canonical single-file frontend), `server.py` (all backend), `datasets/` + `visa_data.py` + `rag.py` (grounding data and retrieval). Legacy React sources live in `archive/src/` (`pages/`, `utils/`, `constants/`) and are no longer built or served.
- Health check: `GET /api/health` returns `{ ok, ai_configured, visa_data_through }` for liveness and config probing (no LLM call).

## Disclaimer

GreenPath provides general information about U.S. immigration processes. It is not a law firm, does not provide legal advice, and is not affiliated with USCIS. Always verify requirements at [uscis.gov](https://www.uscis.gov) and consult a licensed immigration attorney for case-specific guidance.
