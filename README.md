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
| `POST /api/chat` | generic completion (date extraction, translation) |

## Standalone demo

`index-standalone.html` is a self-contained single-file build (scroll-driven SVG stories, animated section emblems, voice read-aloud). Open it directly in a browser — no install, no server.

## Tips

- macOS: port 5000 is taken by AirPlay Receiver. Run `PORT=5001 python server.py` instead.
- `OPENAI_API_KEY` is read from `.env` (python-dotenv).
- Project structure: `src/pages/` (one file per feature), `src/utils/` (API + translation helpers), `src/constants/` (question banks, samples, languages), `server.py` (all backend).

## Disclaimer

GreenPath provides general information about U.S. immigration processes. It is not a law firm, does not provide legal advice, and is not affiliated with USCIS. Always verify requirements at [uscis.gov](https://www.uscis.gov) and consult a licensed immigration attorney for case-specific guidance.