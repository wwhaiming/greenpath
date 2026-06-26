# Legal review of the attorney-handoff taxonomy

**Status: NOT YET REVIEWED by a licensed attorney.** This file is deliberately
honest — it is a checklist for a real reviewer to complete, not a claim that a
review has happened. Do not represent GreenPath as attorney-reviewed until the
table at the bottom is filled in with a real name, organization, and date.

## Why this matters
The handoff detector (`handoff.py`) decides when GreenPath must stop and refer a
person to a licensed attorney instead of letting the LLM answer. In a high-stakes
domain, a deterministic regex is a reasonable *first* layer but cannot be the
final authority on what counts as high-risk. A licensed immigration attorney or
DOJ-accredited representative should confirm the categories and the wording.

## What a reviewer should check
1. **Category completeness** — are the 10 high-risk categories the right ones?
   Current categories (`handoff.py` `_PATTERNS`): removal/deportation
   proceedings; criminal history; fraud/misrepresentation; asylum one-year
   deadline; VAWA / U-visa / T-visa / abuse; inadmissibility bars; prior visa
   denial; unauthorized work; overstay / unlawful presence; unclear / no status.
2. **Under-triggering (false negatives)** — phrasings that should hand off but
   may not (paraphrase, euphemism, other languages). The detector covers EN/ES/ZH
   plus paraphrases; a reviewer should list real-world phrasings still missed.
3. **Over-triggering (false positives)** — benign questions that should NOT be
   refused (the test suite pins ~22 benign cases, incl. multilingual).
4. **Handoff message** — is `HANDOFF_MESSAGE` accurate, non-advice, and pointing
   to legitimate free/low-cost resources?
5. **Safe-prep content** — the "questions to ask an attorney / documents to
   gather" returned on handoff (`handoff.safe_prep`) must contain no legal advice.

## Known limitations (disclosed)
- Lexical/regex detection has inherent blind spots; it is a triage aid, not legal
  judgment.
- Language coverage is partial (EN/ES/ZH triggers; other languages rely on the
  English/paraphrase overlap and the model's own guardrail).
- No attorney has signed off on the taxonomy yet.

## Review record (fill in when completed — do not fabricate)
| Reviewer name | Organization / bar # | Date | Categories reviewed | Changes requested |
|---|---|---|---|---|
| _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
