# GreenPath
AI-powered green card navigation platform \
Created by Whaiming Wang and Gary Zhang for the USAII Global AI Hackathon 2026

## Run

```bash
cp .env.example .env        # then put your OpenAI key in .env (never commit it)
pip install -r requirements.txt
PORT=5001 python server.py  # macOS: AirPlay owns :5000, so use 5001
```

Open http://localhost:5001 — Flask serves the single-file front-end (`index-standalone.html`)
and the five `/api/*` endpoints. The OpenAI key stays server-side; the browser never sees it.

`index-standalone.html` also opens directly (file://) for a quick look — the visuals work
offline, and AI features fall back to a key you paste (kept only in your browser tab). Run the
server for the secure, data-grounded experience.

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
| Frontend | Single-file build `index-standalone.html` — scroll-driven SVG stories, animated emblems, no build step |
| Backend | Flask (Python), serves the front-end + 5 JSON API endpoints, holds the key |
| AI | OpenAI `gpt-4o-mini`, strict JSON contracts per feature, immigration answers grounded in real data |
| OCR / PDF | tesseract.js 5 + pdf.js 3 (CDN, in-browser) |
| Speech | Web Speech API (read-aloud) |

## API endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/pathway` | situation description → likely pathway + next steps |
| `POST /api/document-review` | form entries → severity-ranked issue list |
| `POST /api/interview` | running transcript → coaching + next question |
| `POST /api/stage-qa` | pathway + stage + question → plain-language answer |
| `POST /api/chat` | generic completion (date extraction, translation) |

## Data grounding (not just a wrapper)

Facts the model could get wrong are not left to the model. `visa_data.py` reads the
vendored Visa Bulletin dataset (`datasets/`) plus `forecast.py`'s fitted priority-date
advancement rates and builds a compact factual brief that is **injected into the
Pathway Finder and Stage Q&A system prompts**. So "how long will I wait?" is answered
with real historical movement for the user's country + category, with an explicit
note that figures change monthly and to verify at travel.state.gov. Sources are listed
in [`datasets/SOURCES.md`](datasets/SOURCES.md). The front-end requests grounding via
`{"ground": true}` on `/api/chat`, so the secure proxy and the data grounding apply
to the immigration features automatically.

## Evaluation

`evals/` is a labeled accuracy harness that imports the **production prompts** from
`server.py` and runs them against the live `gpt-4o-mini`, so the score is the deployed
app's, not a copy. Latest run (2026-06-14): **100% on 38 cases** (26 Pathway + 12
Document Review), including a hard tier (TPS/DACA with no direct path, EB-1C transfer,
widow self-petition, missing translation, late conditional-removal). Methodology and
honest limitations: [`evals/RESULTS.md`](evals/RESULTS.md). Reproduce:
`python evals/run_evals.py --date YYYY-MM-DD`.

## Submission (USAII Global AI Hackathon 2026)

Paste-ready Devpost copy mapped to the high-school rubric and the 3–5 min pitch video
script live in [`submission/`](submission/).

## Front-end

`index-standalone.html` is the single-file app — scroll-driven SVG stories, animated
section emblems, voice read-aloud, no build step. `server.py` serves it at `/` and
backs it with the secure `/api/*` endpoints. Opened directly (file://) the visuals work
offline and AI falls back to a pasted key; run the server for the secure, grounded path.

## Tips

- macOS: port 5000 is taken by AirPlay Receiver. Run `PORT=5001 python server.py` instead.
- `OPENAI_API_KEY` is read from `.env` (python-dotenv). `.env` is gitignored; copy `.env.example`. The key is server-side only — it is never sent to the browser when served by `server.py`.
- Project layout: `index-standalone.html` (front-end), `server.py` (backend + 5 API endpoints), `visa_data.py` + `forecast.py` (real-data grounding), `datasets/` (sources), `evals/` (accuracy harness), `submission/` (Devpost copy + pitch script + system-map visual).

## Disclaimer

GreenPath provides general information about U.S. immigration processes. It is not a law firm, does not provide legal advice, and is not affiliated with USCIS. Always verify requirements at [uscis.gov](https://www.uscis.gov) and consult a licensed immigration attorney for case-specific guidance.