# GreenPath — 90-Second Demo Script

One coherent journey: confusion -> pathway -> safety -> a checklist you can carry to legal help.

## Setup
- `netlify dev` (live AI) OR `python3 -m http.server` in `public/` (offline demo works without a key).
- Offline path needs no key: the "See a real case (Maria)" button renders a pre-written sample so the demo never fails on stage.

## Beats (with expected output)
1. **Front door (0:00-0:10):** Home -> "What do you need today?" Click **Find my pathway**. Expected: routes to the Pathway Finder.
2. **Killer flow (0:10-0:35):** Click **See a real case (Maria)** (or paste Maria's situation and "Tell me my next step").
   Expected: a **"Your next safe step"** card, the pathway (Family-based / Adjustment of Status, High confidence), reasoning, suggested steps, a **case-prep checklist** (bring these / before you file / verify on official pages), official-source citations with `[id]` tags.
3. **Safety gate (0:35-0:55):** In the Pathway Finder, type *"I have a prior order of removal."*
   Expected: a red **STOP — talk to an attorney first** block; filing steps are suppressed; "find authorized legal help" link shown. Try *"I overstayed my visa"* -> a **caution** gate that hides steps behind "I understand the warning."
4. **Notice -> timeline (0:55-1:10):** Deadline Alerts -> scan a USCIS notice (image/PDF). Expected: extracted dates added to the on-device timeline.
5. **Trust + accessibility (1:10-1:30):** Switch the language menu (multilingual UI), use read-aloud, show the "Tested with npm test: risk 13/13, proxy 7/7" badge.

## Verifiable proof (no stage needed)
- `npm test` -> `Risk 13/13` (deterministic safety screen) + `chat.js: 10 passed` (proxy guardrails + mocked happy-path/downgrade/error). See `EVAL_RESULTS.md`.
- Live AI suites (Pathway/Review/Grounding) run when `OPENAI_API_KEY` is set; commit that transcript to prove end-to-end AI quality.
