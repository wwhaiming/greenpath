# GreenPath — 90-second demo script

**One applicant. One clear path. One safety stop.**

Persona: **Maria**, married to a U.S. citizen, currently on a tourist visa,
nervous and unsure where to start. We follow her down the single primary path:
**profile → pathway → prep → risk check → next action.**

| Time | What you do on screen | What the judge sees |
|---|---|---|
| 0:00–0:12 | Open GreenPath. Read the one-line value prop and the honest data-flow note in the hero ("scanning runs in your browser; AI text goes to our server + OpenAI"). | Trust set up front: no false "stays in your browser" claim. |
| 0:12–0:35 | **Pathway Finder.** Maria types: *"I'm on a tourist visa and I just married a U.S. citizen."* | AI returns **Family-based → Immediate Relative (spouse of U.S. citizen)**, confidence **high**, with next steps — grounded, plain language, "not legal advice." |
| 0:35–0:50 | **Visa wait (deterministic).** Show the estimate for an immediate relative. | **Measurable outcome:** estimator returns **0 years** (immediate relatives have no visa-bulletin wait) — computed from real Visa Bulletin data through **July 2026**, not the LLM. Source + date labeled. |
| 0:50–1:05 | **Prep + deadlines.** Maria scans her USCIS notice; OCR runs in-browser and auto-fills dates onto her timeline; she follows the I-130/I-485 checklist. | A concrete, saved checklist and timeline — progress persists locally. |
| 1:05–1:25 | **Risk check (the differentiator).** Maria asks a Q&A question that mentions *"I overstayed my last visa and was arrested once."* | The server's deterministic handoff fires: **no AI answer is generated.** A clear modal says *"Please talk to a licensed immigration attorney,"* names why, and links real free/low-cost help (immigrationlawhelp.org, DOJ roster, AILA). |
| 1:25–1:30 | Close on the next-action card. | A safe, honest tool that knows its limits. |

## The measurable outcomes to say out loud
- **0-year** deterministic wait estimate for an immediate relative, from real
  Visa Bulletin data (July 2026) — reproducible, no model guesswork.
- **72/72 = 100%** on the deterministic eval (`npm run eval`): handoff
  precision/recall + estimator + no-legal-advice framing.
- **278 passing tests**, including handoff trigger coverage and **zero false
  positives** on benign questions.
- High-risk inputs produce **0 LLM calls** — the safety stop is provable, not
  promised.

## Judging narrative (Track: AI that genuinely helps people)
Immigration guidance online is either generic or dangerously confident.
GreenPath's bet is that *the most helpful thing an AI immigration tool can do is
know when to stop.* It gives source-backed preparation for the common path, and
for the high-stakes cases where a wrong answer can cost someone their
eligibility, it deterministically refuses to answer and routes the person to a
real attorney. That refusal is enforced **server-side** (so the frontend can't
bypass it), is **deterministic** (so it's testable, not vibes), and is **proven**
by tests and a reproducible eval. It helps people by being honest about its
limits.

## If asked "what's not done yet" (be honest)
Retrieval-backed citations over USCIS source text, a live ZIP→legal-aid
provider lookup, and real email reminders are scoped as TODOs — see the README
and `SECURITY.md`. We did not fabricate sources, providers, or numbers.
