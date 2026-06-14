# GreenPath AI Eval Results

Model: `gpt-4o-mini` | Grounding: Visa Bulletin brief injected | Date: 2026-06-14

| Suite | Cases | Accuracy |
|---|---|---|
| Pathway Finder (`/api/pathway`) | 26 | **100%** |
| Document Review (`/api/document-review`) | 12 | **100%** |
| **Overall** | **38** | **100%** |

## Methodology

Each case is graded against the **production** system prompts imported directly from
`server.py` and the same `gpt-4o-mini` model the live app calls — so this is the
deployed app's score, not a re-implementation. The suite includes a deliberate **hard
tier**: situations with no direct green-card path (TPS-only, DACA-only, tourist with
no basis), multi-pathway cases, and traps a keyword system would miss (EB-1C transfer,
widow self-petition, missing certified translation, late conditional-removal).

Pathway is correct when `primaryPathway` matches the labeled category ("unclear" cases
also pass if the model honestly returns low confidence). Document Review is correct
when `overallStatus` is in the expected set **and** the flagged issue mentions the
real problem.

## Honest limitations

- This measures **classification and issue-spotting**, not the legal correctness of
  downstream prose. It is a regression guard, not a claim of legal infallibility.
- Grading is intentionally lenient on genuinely multi-pathway cases (either valid
  answer passes), reflecting that real cases have more than one route.
- Free-text inputs outside this set can still fail; the set should grow.
- The product's own guardrail is that uncertain cases return
  "Unclear — needs attorney review" rather than a forced guess.

Reproduce: `OPENAI_API_KEY=... python evals/run_evals.py --date YYYY-MM-DD`
