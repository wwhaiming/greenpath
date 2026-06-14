# GreenPath — Pitch Video Script (3–5 min)

Target: **4:00**. Format: screen recording of the live app + talking-head or voiceover.
Speak in plain language — the same value the product delivers. Time budget mirrors the
rubric (problem 30%, so we open there). `[ACTION]` = what's on screen.

---

### 0:00–0:40 — The hook: help exists, but it's invisible  *(Problem, 30%)*

[ACTION: full-screen, a real USCIS form PDF (e.g. I-485) scrolling — dense, English-only.]

> "Everything you need to get a U.S. green card is already public. Hundreds of forms.
> A wait-time bulletin updated every month. It's all out there — and that's exactly
> the problem. It's in legalese, it's English-only, and it's scattered across three
> government websites that never tell *you* where *you* stand.
>
> Most people who file do it without a lawyer, because lawyers are expensive. One
> wrong box can cost them months — or a denial. So the help is technically findable,
> and practically impossible to use."

[ACTION: cut to a phone, late at night, someone scrolling government pages, closing tabs.]

> `[FILL IN: one sentence — your real reason for building this. A family member, a
> neighbor, a community you've watched struggle with this. Say it plainly.]`

---

### 0:40–1:10 — The idea  *(Solution framing)*

[ACTION: open GreenPath home screen — "One clear place to begin."]

> "GreenPath does one thing: it makes the next step obvious. You describe your
> situation in your own words, in any language, and it turns the maze into a sequence
> of human-sized steps — your likely pathway, your realistic wait, your next form,
> your deadlines, and a rehearsal for the interview. It's general information, never
> legal advice — and it says so on every screen."

---

### 1:10–2:55 — Live demo: one user's journey  *(Solution Design 20% + Impact 20%)*

Demo **one continuous story** — a single persona — so it feels real, not a feature tour.

[ACTION: Pathway Finder. Type: *"My wife is a U.S. citizen, I entered on a tourist
visa, we live in Texas."* Submit.]

> "I type my situation like I'd say it to a friend. The AI maps it to a pathway —
> Family-based, adjustment of status — with a confidence level and concrete next
> steps. Notice it gives a confidence level instead of pretending to be certain."

[ACTION: Stage Q&A — ask *"how long will this take?"* — ideally switch the question to
another language to show multilingual.]

> "Here's the part that matters: when I ask about wait times, the answer isn't a
> guess. We loaded the real Visa Bulletin data — actual historical priority-date
> movement by country — straight into the AI. So it answers with real numbers, tells
> me it can change monthly, and points me to the official source. And it answers in
> whatever language I asked in."

[ACTION: Document Review — paste a form entry with a blank signature + a date
mismatch. Show the severity-ranked issues.]

> "Before I file, I paste my form entries and it flags what would trigger a Request
> for Evidence — the unsigned page, the date that doesn't match my passport — ranked
> by severity."

[ACTION: Deadline Alerts — one sentence → timeline. Then Interview Prep — answer one
question, show coaching.]

> "One sentence becomes a deadline timeline. And I can rehearse the interview with an
> AI officer that asks one question at a time and coaches each answer — calm, not an
> interrogation."

---

### 2:55–3:35 — Why AI, and proof it works  *(AI Reasoning 20% + evidence)*

[ACTION: split screen — messy free-text input on the left, clean JSON/structured UI on
the right. Then cut to `evals/RESULTS.md`.]

> "Why does this need AI? Because the hard part is translation, not lookup — turning
> how a real person describes their life into a structured answer, in any language. A
> fixed FAQ can't do that.
>
> But we didn't just trust it. We built a labeled test set — 38 cases, including hard
> ones like TPS and DACA that have *no* direct green-card path — and ran it against
> the live model. It scored 100%, and correctly flagged the no-path cases as 'needs
> an attorney' instead of inventing an answer. That test runs any time we change a
> prompt."

---

### 3:35–4:00 — Responsible AI + close  *(Responsible AI 10%)*

[ACTION: show the persistent legal disclaimer; show the "Unclear — needs attorney
review" output.]

> "This is high-stakes, so the guardrails are the point. The AI is built to *refuse
> to decide* — it returns 'needs an attorney' rather than guess, it grounds facts in
> real data instead of memory, there are no accounts and nothing is stored on a
> server, and every screen hands legal judgment back to a licensed attorney.
>
> GreenPath doesn't replace a lawyer. It makes sure no one is stuck at the very first
> step — not knowing where they stand. That's making support obvious."

[ACTION: end card — GreenPath, team names, "General information, not legal advice."]

---

## Recording checklist

- [ ] App running locally (`python server.py`) with a working `OPENAI_API_KEY` so live AI calls succeed on camera.
- [ ] Pre-load the demo inputs (copy/paste from this script) so there's no typing dead-air.
- [ ] Do one practice pass for timing — aim 3:50–4:10, hard ceiling 5:00.
- [ ] Show the multilingual answer on camera — it's a memorable differentiator.
- [ ] Upload to YouTube/Vimeo/Loom, set to public/unlisted, paste link in Devpost.
- [ ] Say the "general information, not legal advice" line out loud at least once.
