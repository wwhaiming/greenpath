# GreenPath — Devpost Submission Copy

**Track:** Community — *Help is Hard to Find: Make Support Obvious*
**Team:** Whaiming Wang, Gary Zhang
**Built:** USAII Global AI Hackathon 2026

> This file is paste-ready copy for each Devpost field, written to the high-school
> rubric: Problem Understanding & Context (30%), AI Reasoning (20%), Solution
> Design & Architecture (20%), Impact & Insight (20%), Responsible AI (10%).
> `[FILL IN]` marks the few things only the team can truthfully provide — do not
> leave them blank, and do not invent data we did not actually collect.

---

## Elevator pitch (≤ 200 chars)

GreenPath turns the U.S. green-card maze into one clear next step — plain-language guidance, real wait-time data, and document checks, in any language. General info, never legal advice.

---

## 1. Problem Understanding & Context  (rubric 30% — our heaviest section)

**The support exists. Finding and understanding it is the wall.**

The U.S. green-card process is not missing information — it is drowning in it. USCIS
publishes hundreds of forms, fee schedules, and policy manuals; the Department of
State posts a new Visa Bulletin every month. All of it is public. None of it is
*obvious*. The people who need it most hit three walls at once:

- **It's in dense legalese, English-only.** Forms like the I-485 and I-130 assume
  you already know what a "priority date," "adjustment of status," or "preference
  category" is. For the many applicants whose first language isn't English, the
  official material is effectively locked.
- **It's scattered.** Your pathway lives on uscis.gov, your wait time on
  travel.state.gov, your fee on a third page, your interview questions nowhere
  official at all. No single place says *"here is your situation, and here is your
  next step."*
- **Asking feels risky.** Many applicants file *pro se* (without a lawyer) because
  attorneys are expensive, and a single wrong box can trigger a Request for Evidence
  or a denial months later. The fear of getting it wrong is itself a barrier to
  starting.

This is exactly the track's problem — *help is hard to find* — but in one of its
highest-stakes forms: an irreversible, deadline-driven legal process that decides
whether a family stays together.

**Who, specifically:** a person (often on a phone, after work, English as a second
language) trying to navigate their own or a relative's green-card case without a
lawyer, who knows the system is huge and does not know where they personally stand
in it.

> `[FILL IN — strongly recommended]` One or two sentences of the team's *real*
> connection to this problem (a family member's case, a community you've seen
> struggle with it). The rubric rewards a real, relatable problem; an authentic
> personal "why" is worth more than any feature. Do **not** fabricate one.

---

## 2. AI Reasoning — why this needs AI  (rubric 20%)

**The hard part is translation, not lookup — and that is what AI is uniquely good at.**

A static FAQ or decision tree can't solve this, and we can say precisely why:

- **Input is messy free text, output must be structured.** A user writes *"my wife
  is a citizen, I came on a tourist visa and we live in Texas"* — AI maps that to a
  specific pathway (Family-based, adjustment of status) with next steps. A fixed form
  can't anticipate how a real person describes their life.
- **One model, many languages, no rebuild.** The same Q&A endpoint answers in the
  language the user writes in. A hand-built tree would need re-translating for every
  language and every question; the LLM generalizes for free.
- **Judgment-shaped, pattern-based tasks.** "Which of these form entries would make a
  USCIS officer ask for more evidence?" and "ask a realistic interview follow-up to
  *that* answer" are pattern-recognition tasks with no lookup table — the natural fit
  for a language model.

**Where we deliberately did *not* lean on the model:** anything factual and
verifiable (wait times, priority dates, trends) is **grounded in real data we
injected**, not left to the model's memory (see §3). And the deadline parser ships
with an **offline rule-based fallback** so a core feature still works if the API is
down. AI is used where judgment helps and constrained where facts matter.

**AI tools used (disclosure):** OpenAI `gpt-4o-mini` (paid API) for all five AI
endpoints, with strict JSON response contracts. Built with the help of AI coding
assistants (Claude / Claude Code) — disclosed per hackathon rules. In-browser
`tesseract.js` (OCR) and `pdf.js` (PDF text) run client-side; the Web Speech API
provides read-aloud. No model was trained or fine-tuned.

---

## 3. Solution Design & Architecture  (rubric 20%)

**One input → AI (grounded) → one structured, plain-language output.** Every feature
follows the same legible flow:

```
 user's own words ─▶ React SPA ─▶ Flask /api/* ─▶ system prompt + REAL DATA brief
                                                        │
                                                        ▼
                                              OpenAI gpt-4o-mini
                                                        │
                                   strict JSON contract ▼ (validated server-side)
 plain-language result ◀── React renders ◀── { pathway / issues / question / answer }
```

**Seven features, five AI endpoints:**

| Feature | Flow | AI? |
|---|---|---|
| Pathway Finder | situation text → likely category + confidence + next steps | `gpt-4o-mini`, JSON, **grounded** |
| Stage Q&A | pathway + stage + question → plain answer, any language | `gpt-4o-mini`, **grounded** |
| Document Review | form entries → severity-ranked RFE-risk issues | `gpt-4o-mini`, JSON |
| Interview Prep | running transcript → one question + coaching at a time | `gpt-4o-mini`, JSON |
| Deadline Alerts | one sentence → dated timeline | `gpt-4o-mini` + **offline fallback** |
| Language Tools | translate / detect / OCR / PDF / read-aloud | client-side libs + API |
| Guided Walkthrough & Progress | stage-by-stage roadmap, saved locally | no AI (deterministic) |

**The grounding layer is the part judges should look at.** `visa_data.py` reads our
vendored Visa Bulletin dataset plus `forecast.py`'s fitted advancement rates and
builds a compact factual brief that is **injected into the Pathway and Q&A system
prompts**. So when a user asks *"how long will I wait?"*, the answer uses the actual
historical priority-date movement for their country and category — with an explicit
note that it can change monthly and to verify at travel.state.gov. The data we
collected isn't decoration; it changes what the model is allowed to say.

**Stack:** React 18 + Vite (SPA) · Flask (Python) serving `dist/` + 5 JSON endpoints
· OpenAI `gpt-4o-mini` · tesseract.js + pdf.js + Web Speech (all in-browser). Each AI
endpoint validates the model's JSON server-side and returns a clean error rather than
guessing on malformed output.

---

## 4. Impact & Insight  (rubric 20%)

**What becomes easier:** a user goes from *"I don't even know where I am in this
system"* to *"here is my likely pathway, my realistic wait, my next form, the dates I
can't miss, and a rehearsal for the interview"* — in their own language, for free, in
one sitting.

**Who benefits:** *pro se* applicants and the relatives helping them; ESL and
low-vision users (Atkinson Hyperlegible body font, AA-contrast target, full
read-aloud); anyone who would otherwise pay for a consult just to learn which line
they're standing in.

**The insight that shaped the build:** the bottleneck isn't a shortage of help — it's
that help is unreadable and scattered. So GreenPath's job is *translation and
orientation*, not new information: take what's already public and authoritative and
make the next step obvious. Every screen is reachable from the top nav; every AI
surface ends by pointing back to the authoritative source.

**Evidence it works (measured, not asserted):** we built a labeled eval harness
(`evals/`) and ran it against the live model and production prompts —
**38 cases, 100% on both the Pathway classifier and Document Review**, including a
hard tier (TPS/DACA with no direct path, EB-1C transfers, widow self-petitions,
missing translations, late conditional-removal filings). See `evals/RESULTS.md`.
Grading is intentionally lenient only on genuinely multi-pathway cases; this is a
regression guard, not a claim of legal infallibility.

> `[FILL IN — optional but powerful]` If any *real* person tried it and said
> something useful, quote them. If not, say "next step: user testing with [community
> org]" — an honest plan beats a fake testimonial.

---

## 5. Responsible AI  (rubric 10%)

**One realistic risk + one concrete design choice that reduces it** (the exact field
Devpost asks for):

> **Risk — over-reliance / unauthorized-practice-of-law.** A scared user could treat
> AI output as a legal decision and file (or not file) based on a confident-sounding
> hallucination, in a process where mistakes are expensive and slow to reverse.
>
> **Guardrail — refuse-to-decide by design + factual grounding.** Every system prompt
> forbids legal advice and case-outcome prediction; the Pathway model must return an
> explicit **"Unclear — needs attorney review"** category and a **confidence level**
> instead of forcing a guess (verified: our no-basis / TPS / DACA cases all correctly
> return *Unclear, low confidence*). Verifiable facts (wait times) are **grounded in
> real Visa Bulletin data**, not the model's memory, and every answer ends by
> pointing to uscis.gov / travel.state.gov and a licensed attorney. A persistent
> legal disclaimer sits on every page.

Other responsible-AI choices: **privacy** — no accounts, no server-side storage;
progress is saved only in the user's own browser (`localStorage`), and OCR/PDF
parsing runs client-side. **Safety on bad output** — the server validates the model's
JSON and returns a clean error rather than rendering garbage. **Disclosure** — all AI
tools, the paid model, and AI coding assistance are listed, per the rules.

---

## Required Devpost fields — quick-copy

**Tools & data disclosure:** OpenAI `gpt-4o-mini` (paid); tesseract.js, pdf.js, Web
Speech API (free, client-side); React, Vite, Flask. AI coding assistants (Claude
Code) used during development. **Data:** U.S. DOS Visa Bulletin history, USCIS LPR /
nonimmigrant admissions by country (2005–2016), DOL PERM FY2024 outcomes — all public
government sources, listed with links in `datasets/SOURCES.md`. No scraped or private
data. No model training.

**Human-in-the-loop:** GreenPath never files anything and never decides a case. It
orients the user and explicitly hands judgment to a licensed attorney for anything
complex; the user reviews every output and acts on official sources.

**Working demo:** `[FILL IN — live URL once deployed]` + 3–5 min pitch video
(`submission/PITCH_SCRIPT.md`). Local run: `npm install && npm run build && python
server.py`.

**Originality / build window:** core product built for this hackathon by the listed
team; AI assistance disclosed. `[FILL IN — confirm work done within the June 14–21
window per the rules; keep committing in-window.]`
