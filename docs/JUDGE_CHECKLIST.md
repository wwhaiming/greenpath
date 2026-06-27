# Judge / Demo Deployment Checklist

GreenPath is built so a live demo cannot silently break. Every AI feature has a
deterministic fallback, and the safety + data features need no API key at all.

## Fastest path: no-key offline demo (recommended for judging)

```bash
pip install -r requirements-dev.txt
GREENPATH_DEMO=1 .venv/bin/python server.py
# open http://localhost:5000  (macOS: PORT=5001 if AirPlay uses 5000)
```

In demo mode every AI route returns a recorded, **source-backed**, clearly
labeled (`"demo": true`) sample instead of an error. Citations in the demo
answers are still verbatim from the on-disk corpus, and the attorney-handoff
safety stop still runs first.

## Full live AI (optional)

```bash
echo "OPENAI_API_KEY=sk-...your-real-key..." >> .env   # gitignored
.venv/bin/python server.py
```

## Pre-demo verification (30 seconds)

```bash
.venv/bin/python -m pytest tests/ -q                       # 281 passed
.venv/bin/python evals/eval.py                            # 72/72 = 100.0%
curl -s localhost:5000/api/health        | python -m json.tool
curl -s localhost:5000/api/freshness     | python -m json.tool
```

`/api/health` reports `ai_configured`, `demo_mode`, `data_fresh`,
`visa_data_stale`, and `rate_limiter` so you can see the exact runtime state.

## What works WITHOUT any key (point these out)

| Feature | Endpoint | Notes |
|---|---|---|
| Attorney-handoff safety stop | all AI routes | deterministic, runs before any model call |
| Visa-wait estimate | `POST /api/visa-estimate` | computed from real Visa Bulletin data |
| Legal-aid lookup (by state/ZIP) | `GET/POST /api/legal-aid` | real nonprofit directory |
| Location-aware handoff help | `POST /api/handoff-help` | urgency + docs + referrals |
| Source freshness | `GET /api/freshness` | dataset ages + staleness |
| Privacy notice | `GET /api/privacy` | no-retention guarantees |
| Language matrix | `GET /api/languages` | tested OCR/read-aloud/handoff status |

## Talking points

- **Honest data freshness:** the panel shows exactly which bundled datasets are
  current or stale, including Visa Bulletin coverage through July 2026; where
  GreenPath and an official source differ, the official source controls. A CI
  tripwire fails if the curated corpus ages past 90 days.
- **Safety first:** high-risk situations (removal, criminal history, fraud,
  asylum deadlines, abuse) hard-stop to an attorney with crisis urgency + nearby
  legal aid + what to bring — never an AI guess.
- **No live-demo single point of failure:** demo mode removes the API key as a
  failure mode without faking a live model.
