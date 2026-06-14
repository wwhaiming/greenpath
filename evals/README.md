# GreenPath AI Evals

Labeled accuracy tests for the two structured-output features, run against the
**live model and production prompts** (imported from `server.py`) so the score
reflects the deployed app — not a re-implementation.

## Run

```bash
# from repo root, with OPENAI_API_KEY in .env (server.py loads it)
python evals/run_evals.py --date 2026-06-14
python evals/run_evals.py --min 0.8     # exit 1 if either suite < 80% (CI gate)
```

## Files

| File | What |
|---|---|
| `cases.json` | Labeled cases: `pathway` (classifier) + `review` (document review), incl. a hard tier |
| `run_evals.py` | Imports `PW_SYSTEM`/`DR_SYSTEM`/`client` from `server.py`, calls the model, grades, writes results |
| `results.json` | Machine-readable per-case results |
| `RESULTS.md` | Human summary + methodology + honest limitations |

## Adding cases

Append to `cases.json`. Use the **exact** category strings the prompts in `server.py`
emit (`Family-based`, `Employment-based`, `Humanitarian (Asylum/Refugee)`,
`Diversity Visa`, `Investment (EB-5)`, `Special Immigrant`,
`Unclear — needs attorney review`). Accuracy only means something with coverage —
adversarial and ambiguous cases are the valuable ones.
