"""Semantic (LLM) attorney-handoff classifier — a SECOND, non-lexical layer.

Why this exists
---------------
``handoff.py`` is a deterministic regex detector. It is fast, free, testable, and
*authoritative*, but it is purely lexical: it can miss indirect / euphemistic
English ("they took my brother to the detention center"), code-switched /
mixed-language phrasing, and roundabout descriptions of criminal history or
removal that never use a trigger word. This module adds a semantic layer that
asks an LLM to classify the SAME high-risk categories.

Hard safety contract
---------------------
* This layer is ADVISORY ONLY. It can ESCALATE to a handoff when the regex missed
  something, but it must NEVER be allowed to downgrade a deterministic handoff
  (that wiring lives in ``handoff.triage_handoff``).
* It MUST degrade safely. With no ``OPENAI_API_KEY``, on any network/parse/API
  error, or on malformed model output, it returns ``{"handoff": None}`` — the
  "unknown" sentinel — so the deterministic regex stays in charge and nothing
  breaks. It never raises.
* It reuses the server's OpenAI client pattern (``from openai import OpenAI`` with
  the key read from the environment) and the same ``gpt-4o-mini`` model, but
  builds its own lazily-created client so importing this module never needs Flask
  or a live key.

Return shape (always a dict):
    {"handoff": True|False|None,   # None = unknown / unavailable (degraded)
     "category": "<key>"|None,
     "confidence": 0.0..1.0,
     "reasons": ["...", ...]}
"""
import os
import json
import logging

log = logging.getLogger(__name__)

# Same model the server uses for its quality routes. Cheap + fast; this is a
# binary-ish classification, not generation.
MODEL = "gpt-4o-mini"

# The unknown / unavailable sentinel. handoff=None means "the semantic layer has
# no opinion" so the deterministic regex remains authoritative.
_UNKNOWN = {"handoff": None, "category": None, "confidence": 0.0, "reasons": []}

# The category vocabulary mirrors handoff.py so an escalation maps cleanly onto
# the existing safe_prep() document/urgency tables.
_CATEGORIES = [
    "removal_proceedings",
    "criminal_history",
    "fraud_misrepresentation",
    "asylum_one_year_deadline",
    "vawa_u_t_visa",
    "inadmissibility_bars",
    "prior_visa_denial",
    "unauthorized_work",
    "overstay_unlawful_presence",
    "unclear_no_status",
]

_SYSTEM_PROMPT = (
    "You are a conservative SAFETY classifier for an immigration self-help tool. "
    "You do NOT give legal advice. Your only job: decide whether the user's "
    "message reveals a HIGH-RISK immigration situation that must be handed off to "
    "a licensed attorney instead of answered by an automated tool.\n\n"
    "High-risk categories (use these exact keys):\n"
    "- removal_proceedings: deportation/removal, immigration court, detention, "
    "ICE custody, a notice/letter to see an immigration judge, a relative or the "
    "user 'taken to a detention center'.\n"
    "- criminal_history: any arrest, charge, conviction, jail/prison, probation, "
    "or being 'taken to the police'/'in trouble with the law'.\n"
    "- fraud_misrepresentation: fake/borrowed documents, lying on forms, someone "
    "else's identity or papers.\n"
    "- asylum_one_year_deadline: fear of return, persecution, asylum, credible "
    "fear.\n"
    "- vawa_u_t_visa: domestic violence, abuse, trafficking.\n"
    "- inadmissibility_bars: 3/10-year or permanent bars, waivers.\n"
    "- prior_visa_denial: a visa/petition that was denied or refused.\n"
    "- unauthorized_work: working without authorization, cash/off-the-books work.\n"
    "- overstay_unlawful_presence: overstayed, out of status, expired status.\n"
    "- unclear_no_status: undocumented, entered without inspection, no papers.\n\n"
    "Catch INDIRECT, euphemistic, and mixed-language (e.g. Spanish/English, "
    "Chinese/English) phrasing that the keyword filter would miss. Be conservative "
    "but precise: do NOT flag ordinary, benign questions about forms, fees, "
    "processing times, document checklists, interview prep, or normal renewals "
    "where nothing risky is disclosed.\n\n"
    "Respond ONLY with strict JSON of the form: "
    '{"handoff": true|false, "category": "<one key above or null>", '
    '"confidence": <number 0..1>, "reasons": ["short phrase", ...]}. '
    "confidence is your certainty that a handoff is warranted."
)


def _build_client():
    """Construct an OpenAI client the same way the server does, or return None if
    no key is configured. Imported lazily so this module loads with no key and no
    network. Never raises out of this function for config reasons."""
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    from openai import OpenAI  # local import: keeps module import cheap/offline
    return OpenAI(api_key=key, timeout=15.0)


def _coerce(data):
    """Normalize raw model JSON into the public return shape. Returns the unknown
    sentinel if the payload is unusable."""
    if not isinstance(data, dict):
        return dict(_UNKNOWN)
    raw_handoff = data.get("handoff")
    if not isinstance(raw_handoff, bool):
        return dict(_UNKNOWN)
    try:
        conf = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(conf, 1.0))
    category = data.get("category")
    if category not in _CATEGORIES:
        category = None
    reasons = data.get("reasons")
    if isinstance(reasons, str):
        reasons = [reasons]
    elif not isinstance(reasons, list):
        reasons = []
    reasons = [str(r) for r in reasons if str(r).strip()][:6]
    return {"handoff": raw_handoff, "category": category,
            "confidence": conf, "reasons": reasons}


def semantic_handoff(text, client=None):
    """Classify free text for high-risk handoff using an LLM (gpt-4o-mini).

    SAFE-DEGRADING: returns ``{"handoff": None, ...}`` (unknown) whenever the key
    is missing, the text is empty, or anything goes wrong (network, API, parse,
    malformed output). Never raises. The deterministic regex in ``handoff.py``
    stays authoritative; this only ever ADDS signal via ``triage_handoff``.

    ``client`` is an OPTIONAL injectable chat client (anything exposing the same
    ``client.chat.completions.create(...)`` -> ``resp.choices[0].message.content``
    surface as the OpenAI SDK). When provided it is used INSTEAD of building a
    live, billable client, so the real parse + ``_coerce`` + decision path can be
    exercised against recorded/mock classifier responses with NO key and NO
    network (see ``evals/semantic_replay.py``). The safe-degrade contract is
    unchanged: with ``client=None`` and no ``OPENAI_API_KEY`` this still returns
    the unknown sentinel, and a malformed/erroring injected client still degrades
    to unknown rather than raising.
    """
    if not isinstance(text, str) or not text.strip():
        return dict(_UNKNOWN)
    try:
        if client is None:
            client = _build_client()
        if client is None:
            return dict(_UNKNOWN)
        resp = client.chat.completions.create(
            model=MODEL,
            temperature=0,
            max_tokens=200,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
        )
        content = resp.choices[0].message.content
        return _coerce(json.loads(content))
    except Exception as exc:  # noqa: BLE001 — degrade safely on ANYTHING
        log.info("semantic_handoff degraded (%s); regex remains authoritative",
                 exc.__class__.__name__)
        return dict(_UNKNOWN)
