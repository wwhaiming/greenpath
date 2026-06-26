# GreenPath
AI-powered green card navigation platform \
Created by Whaiming Wang and Gary Zhang for the USAII Global AI Hackathon 2026

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
- **Language Tools** — translate, auto-detect language, scan documents (image OCR + PDF), and read results aloud in 100+ languages
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
npm test            # or: .venv/bin/python -m pytest tests/ -q   (56 tests)
npm run eval        # or: .venv/bin/python evals/eval.py
```

The eval (`evals/eval.py`, ground truth in `evals/cases.json`) scores the
deterministic safety surfaces — handoff precision/recall, the visa estimator,
and grounding/no-legal-advice framing. It calls **no LLM**, so the number is
identical on every run. Current result: **33/33 = 100.0%**. CI
(`.github/workflows/ci.yml`) runs both on every push.

## Data freshness

The deterministic visa-wait estimate is computed from real U.S. Department of
State Visa Bulletin history **through the December 2025 bulletin** (the latest
available at build time). Cutoffs change monthly — the UI links the official
bulletin and labels its source/date, and where GreenPath and an official source
differ, the official source controls.

## Standalone demo

`index-standalone.html` is a self-contained single-file build (scroll-driven SVG stories, animated section emblems, voice read-aloud). Open it directly in a browser — no install, no server.

## Tips

- macOS: port 5000 is taken by AirPlay Receiver. Run `PORT=5001 python server.py` instead.
- `OPENAI_API_KEY` is read from `.env` (python-dotenv).
- Project structure: `src/pages/` (one file per feature), `src/utils/` (API + translation helpers), `src/constants/` (question banks, samples, languages), `server.py` (all backend).

## Disclaimer

GreenPath provides general information about U.S. immigration processes. It is not a law firm, does not provide legal advice, and is not affiliated with USCIS. Always verify requirements at [uscis.gov](https://www.uscis.gov) and consult a licensed immigration attorney for case-specific guidance.