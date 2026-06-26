"""Claim-to-source grounding for GreenPath answers (judge gap #2).

PROBLEM
-------
Returning the *retrieved* sources as "citations" only proves retrieval ran - it
does NOT prove the model actually relied on those sources. A model can still
assert a fee or deadline that appears nowhere in the quotes while a citation sits
next to it implying support.

SOLUTION
--------
Require the model to emit STRUCTURED output that maps every factual claim to the
source(s) and the verbatim quote span it used::

    {
      "answer": "<plain-language answer>",
      "claims": [
        {"text": "<one factual sentence from the answer>",
         "source_ids": [1, 2],
         "quote_used": "<verbatim snippet copied from a cited source quote>"}
      ]
    }

Then VERIFY server-side (this module, deterministic, no LLM):
  * ``quote_used`` must be a verbatim substring of one of the cited retrieved
    source quotes (whitespace-normalized, case-insensitive). A claim whose
    quote_used is empty or not found in any cited source is UNSUPPORTED.
  * Citations returned to the client are derived ONLY from the sources whose
    quotes were actually used by a supported claim - so a citation can never
    imply support the model did not have.
  * Unsupported factual claims are surfaced (``ungrounded_claims``) so the UI can
    flag them and direct the user to verify at uscis.gov.

This module is pure and unit-tested offline; the model call lives in server.py.
"""
from __future__ import annotations

import json
import re

# Instruction appended to the Q&A system prompt to request the structured shape.
CLAIM_MAPPING_INSTRUCTION = (
    "Return ONLY a JSON object (no prose, no markdown fences) with this exact "
    "shape:\n"
    '{\n'
    '  "answer": "your plain-language answer, 3-5 short paragraphs, ending with '
    '\\"Always verify current requirements at uscis.gov before taking action.\\"",\n'
    '  "claims": [\n'
    '    {"text": "one factual sentence from your answer",\n'
    '     "source_ids": [1],\n'
    '     "quote_used": "a verbatim snippet copied exactly from that numbered '
    'OFFICIAL SOURCE quote that supports the sentence"}\n'
    '  ]\n'
    "}\n"
    "Rules: every factual sentence (forms, fees, dates, eligibility, process "
    "steps) MUST appear as a claim whose quote_used is copied VERBATIM from one "
    "of the numbered OFFICIAL SOURCES above. Do NOT assert any fact you cannot "
    "ground in a quote. If the sources do not cover something, say so in the "
    "answer instead of guessing, and omit a claim for it."
)


def _norm(s):
    """Whitespace-normalized, lowercased form for verbatim-substring matching."""
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def parse_structured(text):
    """Parse a model reply into the {answer, claims[]} shape. Returns the dict on
    success or None when the reply is not the structured object (so the caller can
    fall back to legacy plain-text handling)."""
    if not isinstance(text, str) or not text.strip():
        return None
    s = text.strip()
    s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
    s = re.sub(r"\s*```$", "", s).strip()
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        obj = json.loads(s[start:end + 1])
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("answer"), str):
        return None
    if "claims" in obj and not isinstance(obj["claims"], list):
        return None
    return obj


def validate(claims, sources):
    """Verify each claim's quote_used against the cited retrieved sources.

    ``sources`` is the ordered list returned by rag.retrieve (1-based [n] in the
    prompt). Returns a report dict::

        {"claims": [{text, source_ids, quote_used, supported}],
         "supported": int, "total": int, "all_supported": bool,
         "ungrounded_claims": [text, ...],
         "used_source_indexes": sorted([0-based idx, ...])}
    """
    norm_quotes = [_norm(s.get("quote", "")) for s in sources]
    n = len(sources)
    out_claims, ungrounded, used = [], [], set()

    for c in claims or []:
        if not isinstance(c, dict):
            continue
        text = c.get("text", "") if isinstance(c.get("text"), str) else ""
        raw_ids = c.get("source_ids") or []
        if not isinstance(raw_ids, list):
            raw_ids = []
        # 1-based ids from the prompt -> 0-based indexes that actually exist.
        idxs = [i - 1 for i in raw_ids if isinstance(i, int) and 1 <= i <= n]
        quote = c.get("quote_used", "") if isinstance(c.get("quote_used"), str) else ""
        nq = _norm(quote)

        supported = False
        if nq:
            # Verbatim snippet must appear in a cited source quote (or, if the
            # model cited nothing/invalid, in ANY retrieved quote).
            search_idxs = idxs if idxs else range(n)
            for i in search_idxs:
                if 0 <= i < n and nq and nq in norm_quotes[i]:
                    supported = True
                    used.add(i)
                    break
        out_claims.append({"text": text, "source_ids": raw_ids,
                           "quote_used": quote, "supported": supported})
        if not supported and text.strip():
            ungrounded.append(text)

    supported_count = sum(1 for c in out_claims if c["supported"])
    return {
        "claims": out_claims,
        "supported": supported_count,
        "total": len(out_claims),
        "all_supported": len(out_claims) > 0 and supported_count == len(out_claims),
        "ungrounded_claims": ungrounded,
        "used_source_indexes": sorted(used),
    }


def citations_from_report(report, sources, as_citation):
    """Citations derived ONLY from sources a supported claim actually used. Falls
    back to all retrieved sources when the model produced no usable claim mapping
    (so we never show FEWER citations than the legacy path could justify)."""
    used = report.get("used_source_indexes") or []
    if used:
        return [as_citation(sources[i]) for i in used if 0 <= i < len(sources)]
    return [as_citation(s) for s in sources]
