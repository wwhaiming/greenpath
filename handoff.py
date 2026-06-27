"""Deterministic attorney-handoff detection for GreenPath.

Single source of truth for *when GreenPath must stop and refer the user to a
licensed immigration attorney instead of letting the LLM answer*. Pure module
(no I/O, no network, no LLM) so behavior is deterministic and unit-testable, and
reused across every AI endpoint in ``server.py`` (``/api/chat``,
``/api/pathway``, ``/api/stage-qa``, ``/api/document-review``,
``/api/interview``).

Design notes
------------
* High-risk categories are situations where a wrong automated answer can cause
  permanent, irreversible harm (loss of eligibility, triggering a bar, missing a
  filing deadline, self-incrimination). There the SAFE failure mode is to refuse
  and hand off.
* Patterns are tuned to avoid the most common benign false positives
  (e.g. "fee waiver", "advance parole", "my visa expires next year", "I'm not
  sure which form") while still catching dangerous past-tense / status cases.
* ``build_handoff_response`` returns a payload that degrades gracefully: it
  carries ``handoff: true`` AND fills each endpoint's native text field with the
  attorney message, so existing frontend renderers show the message even before
  any frontend change.
"""

import re


def _p(*alternatives):
    """Compile a case-insensitive regex matching any of the alternatives."""
    return re.compile('|'.join(alternatives), re.IGNORECASE)


# The user-facing message. Intentionally NOT legal advice: states the limit, the
# risk, and points to real free/low-cost help. No fabricated providers.
HANDOFF_MESSAGE = (
    "Based on what you shared, your situation involves factors that need a "
    "licensed immigration attorney - not an AI tool. GreenPath helps you prepare "
    "and understand the process, but it does not give legal advice, and getting "
    "these specific issues wrong can have serious, sometimes permanent "
    "consequences for your case.\n\n"
    "Please talk to a licensed immigration attorney or a DOJ-accredited nonprofit "
    "before you file or sign anything. Free and low-cost options:\n"
    "- immigrationlawhelp.org - search free/low-cost legal aid by ZIP code\n"
    "- justice.gov/eoir/recognition-and-accreditation-program - DOJ-recognized organizations\n"
    "- ailalawyer.com - American Immigration Lawyers Association referral service\n\n"
    "If you are currently in removal/deportation proceedings or detention, "
    "contact an attorney urgently."
)


# ── Crisis urgency per category ──────────────────────────────────────────────
# "urgent" = a hard deadline or active proceeding where delay itself can cause
# irreversible harm (removal hearings, detention, the asylum one-year filing
# deadline). "high" = serious eligibility/bar issues that need counsel before
# filing but are not clock-driven in the same way. Used to label the handoff so a
# user in crisis sees location-aware next steps, not just "talk to a lawyer".
_URGENCY = {
    "removal_proceedings": "urgent",
    "asylum_one_year_deadline": "urgent",
    "vawa_u_t_visa": "urgent",
    "criminal_history": "high",
    "fraud_misrepresentation": "high",
    "inadmissibility_bars": "high",
    "prior_visa_denial": "high",
    "unauthorized_work": "high",
    "overstay_unlawful_presence": "high",
    "unclear_no_status": "high",
}

# Official, government / bar-association resources only (no fabricated providers).
OFFICIAL_RESOURCES = [
    {"name": "ImmigrationLawHelp.org (nonprofit legal-aid directory, search by ZIP)",
     "url": "https://www.immigrationlawhelp.org/"},
    {"name": "DOJ EOIR list of recognized organizations & accredited representatives",
     "url": "https://www.justice.gov/eoir/recognition-and-accreditation-program"},
    {"name": "AILA Immigration Lawyer Referral Service",
     "url": "https://www.ailalawyer.com/"},
    {"name": "USCIS official site (forms, fees, current requirements)",
     "url": "https://www.uscis.gov/"},
]

# Documents almost any applicant should gather before meeting an attorney. These
# are organizational, NOT legal advice — they tell the user what to bring, not
# what it means or what to do with it.
_DOCS_GENERAL = [
    "Government-issued photo ID and passport(s) (current and expired)",
    "Any USCIS notices or letters you have received (with the receipt number)",
    "I-94 arrival/departure record and copies of any prior visas",
    "Copies of every immigration form you have already filed",
    "A written timeline of your entries to and exits from the U.S.",
]
# Category-specific documents to ADD (still organizational, not advice).
_DOCS_BY_CATEGORY = {
    "removal_proceedings": [
        "Your Notice to Appear (NTA) and any immigration-court hearing notices",
        "Any bond paperwork or detention documents",
    ],
    "criminal_history": [
        "Certified court dispositions for every arrest or charge (even if dismissed)",
        "Any police reports or sentencing records you can obtain",
    ],
    "fraud_misrepresentation": [
        "Copies of the application(s) or document(s) in question",
    ],
    "asylum_one_year_deadline": [
        "Evidence of your date of last entry (the one-year clock is critical)",
        "Any documents supporting your fear of return (keep originals safe)",
    ],
    "vawa_u_t_visa": [
        "Any police reports, protective orders, or medical records (only if safe to carry)",
        "Proof of your relationship to the abuser/petitioner, if applicable",
    ],
    "inadmissibility_bars": [
        "Records of all prior U.S. entries, departures, and any prior removals",
    ],
    "prior_visa_denial": [
        "Your visa refusal letter or 221(g) notice and the case number",
    ],
    "unauthorized_work": [
        "A list of employers and approximate dates (do not bring anything you are unsure about)",
    ],
    "overstay_unlawful_presence": [
        "Your I-94 and any documents showing your authorized stay dates",
    ],
    "unclear_no_status": [
        "Anything showing how and when you entered the U.S., if you have it",
    ],
}

# Questions a non-lawyer can safely bring to an attorney. Framing the visit, not
# answering the legal question.
QUESTIONS_FOR_ATTORNEY = [
    "Given my specific history, am I eligible to apply, and is there any risk in filing?",
    "Are there any deadlines or filing windows I need to protect right now?",
    "Could anything in my past trigger a bar, denial, or referral to immigration court?",
    "What documents and evidence will I need, and how should I gather them?",
    "What are my realistic options, and what are the risks of each?",
    "What are your fees, and do you offer a free or low-cost consultation?",
]

# The KIND of help each situation calls for. This is general routing ("see this
# type of professional"), NOT legal advice and NOT a specific provider name -- it
# points the person at the right category of help so a referral is useful.
_WHO_BY_CATEGORY = {
    "removal_proceedings": "an immigration attorney who handles removal/deportation defense, "
                           "or a DOJ/EOIR-recognized nonprofit. If you are detained, seek help urgently.",
    "criminal_history": "an immigration attorney experienced in 'crimmigration' (how a criminal "
                        "record affects immigration).",
    "fraud_misrepresentation": "an immigration attorney -- fraud/misrepresentation findings carry "
                               "serious, lasting consequences.",
    "asylum_one_year_deadline": "an asylum/refugee legal-aid organization or an immigration attorney "
                                "-- the one-year asylum filing deadline is time-sensitive.",
    "vawa_u_t_visa": "a VAWA / U-visa / T-visa or domestic-violence victim-services organization -- "
                     "many offer free, confidential help.",
    "inadmissibility_bars": "an immigration attorney who handles waivers and grounds of inadmissibility.",
    "prior_visa_denial": "an immigration attorney experienced with consular processing and visa denials.",
    "unauthorized_work": "an immigration attorney -- unauthorized work can affect eligibility.",
    "overstay_unlawful_presence": "an immigration attorney -- unlawful presence can trigger re-entry bars.",
    "unclear_no_status": "an immigration attorney or a DOJ-accredited nonprofit to assess your situation.",
}
_WHO_DEFAULT = "a licensed immigration attorney or a DOJ-accredited nonprofit."


def who_to_see(category):
    """The KIND of help a given handoff category calls for (general routing, not
    legal advice, not a specific provider)."""
    return _WHO_BY_CATEGORY.get(category, _WHO_DEFAULT)


def urgency_for(category):
    """Map a handoff category to a crisis-urgency label ('urgent'|'high')."""
    return _URGENCY.get(category, "high")


def documents_to_gather(reasons_keys):
    """General + category-specific documents to bring to an attorney, de-duped in
    a stable order. ``reasons_keys`` is the list of matched category keys."""
    docs = list(_DOCS_GENERAL)
    seen = set(docs)
    for key in reasons_keys:
        for d in _DOCS_BY_CATEGORY.get(key, []):
            if d not in seen:
                docs.append(d)
                seen.add(d)
    return docs


def safe_prep(hand):
    """Build the non-advice 'safe preparation' bundle attached to every handoff:
    crisis urgency, what to ask an attorney, what documents to gather, and
    official resource links. Deterministic; contains no legal advice."""
    keys = hand.get("reason_keys") or ([hand["category"]] if hand.get("category") else [])
    return {
        "urgency": urgency_for(hand.get("category")),
        "who_to_see": who_to_see(hand.get("category")),
        "questions_for_attorney": list(QUESTIONS_FOR_ATTORNEY),
        "documents_to_gather": documents_to_gather(keys),
        "official_resources": list(OFFICIAL_RESOURCES),
    }


# Ordered: the first matching category becomes the reported ``category``.
# Each entry: (key, human-readable label, compiled pattern).
# Word boundaries (\b) guard short tokens (NTA, EWI, DUI, CAT) from matching
# inside unrelated words.
_PATTERNS = [
    ("removal_proceedings", "removal or deportation proceedings", _p(
        r"remov[ae]l proceeding", r"\bdeport(ed|ation|able)?\b",
        # Misspelling-tolerant: deportaton / deportasion / deportacion / deportate.
        r"\bdeporta\w*", r"immigration court",
        r"notice to appear", r"\bNTA\b", r"order of removal", r"final order of",
        r"ICE (detain|custody|hold|arrest)", r"\bdetained by\b", r"in proceedings",
        # English paraphrase / euphemism
        r"picked (?:me |us |him |her |them |someone )?up by (immigration|ice|border patrol|the immigration)",
        r"papers to see (a |an |the )?(immigration )?judge",
        r"to see (a |an |the )?immigration judge",
        r"(letter|notice) to appear (in|before|at)",
        r"appear in (immigration )?court",
        # Spanish (accent / no-accent variants)
        r"me deportaron", r"orden de deportaci[oó]n",
        r"corte de inmigraci[oó]n", r"proceso de deportaci[oó]n",
        # Simplified Chinese: deportation / removal
        r"遣返", r"驱逐出境", r"递解出境",
    )),
    ("criminal_history", "a criminal record or arrest", _p(
        r"\barrest(ed)?\b", r"convict(ed|ion)", r"criminal (record|history|charge|case)",
        r"\bfelony\b", r"\bmisdemeanor\b", r"\bDUI\b", r"\bDWI\b",
        r"charged with", r"pled? guilty", r"on probation",
        r"crime of moral turpitude", r"aggravated felony", r"\bexpunge",
        r"\bin jail\b", r"\bin prison\b", r"served time",
        # Spanish
        r"me arrestaron", r"me detuvo la polic[ií]a", r"antecedentes penales",
    )),
    ("fraud_misrepresentation", "possible fraud or misrepresentation", _p(
        r"misrepresent", r"\bfraud", r"fake (document|passport|id|marriage)",
        r"false (information|statement|document|claim)", r"forg(ed|ery)",
        r"lied (on|to|about)", r"falsifi", r"\bsham marriage\b",
        # English paraphrase / euphemism
        r"used someone else'?s? (id|identification|papers|ssn|social)",
        r"borrowed someone'?s? (id|papers|ssn|social)",
    )),
    ("asylum_one_year_deadline", "an asylum / persecution claim (time-sensitive)", _p(
        r"\basylum\b", r"persecut", r"credible fear", r"withholding of removal",
        r"convention against torture", r"\bCAT\b", r"refugee status",
        r"fear(ed)? (returning|going back|persecution)",
    )),
    ("vawa_u_t_visa", "a VAWA / U-visa / T-visa or abuse/trafficking situation", _p(
        r"\bVAWA\b", r"violence against women", r"\bU[- ]?visa\b", r"\bT[- ]?visa\b",
        r"\btrafficking\b", r"domestic (violence|abuse)", r"\bbattered\b",
        r"abused by", r"(husband|wife|spouse|partner) (hit|abused|beat|threatened)",
    )),
    ("inadmissibility_bars", "a possible inadmissibility ground or bar", _p(
        r"inadmissib", r"three[- ]year bar", r"3[- ]year bar",
        r"ten[- ]year bar", r"10[- ]year bar", r"permanent bar",
        r"grounds of inadmissib", r"\bi-?601\b", r"provisional waiver",
        r"unlawful presence waiver", r"\bi-?212\b",
    )),
    ("prior_visa_denial", "a prior visa or application denial", _p(
        r"visa (was |application )?denied", r"denied my (visa|application|green ?card)",
        r"\b221\s?\(?g\)?\b", r"administrative processing", r"consular (refusal|return)",
        r"(green ?card|application|petition|case) (was |got )?denied",
        r"previously denied", r"denied entry", r"visa refused",
    )),
    ("unauthorized_work", "possible unauthorized employment", _p(
        r"unauthorized (work|employment)",
        r"work(ed|ing)? without (authorization|a permit|an? ead)",
        r"worked illegally", r"working illegally", r"under the table",
        r"no work permit",
        # English paraphrase / euphemism
        r"work(ed|ing|s)? cash jobs?", r"worked .{0,12}(paid|all) (in )?cash",
        # Spanish
        r"trabaj[eé] sin permiso", r"trabaj(o|aba) en efectivo",
    )),
    ("overstay_unlawful_presence", "an overstay or unlawful presence", _p(
        r"overstay", r"out of status", r"fell out of status", r"lost my status",
        r"unlawful(ly)? presen", r"unauthorized presence",
        r"stayed (past|beyond|longer than|after)",
        r"expired visa", r"my (visa|i-?94) (has )?expired",
        # Spanish (past-tense expiry only; "expira el próximo año" stays benign)
        r"mi visa (venci[oó]|expir[oó]|ya venci[oó]|ya expir[oó])",
        r"se me venci[oó] la visa", r"me qued[eé] m[aá]s tiempo",
        # Simplified Chinese: overstay
        r"逾期居留", r"逾期滞留", r"逾期逗留", r"签证过期", r"逾期停留",
    )),
    ("unclear_no_status", "unclear or no current legal status", _p(
        r"undocumented", r"no legal status", r"\bno papers\b", r"unclear (legal )?status",
        r"entered without inspection", r"\bEWI\b", r"crossed the border",
        r"here illegally", r"illegally in the", r"snuck (in|into|across)",
        # English paraphrase / euphemism
        r"crossed( the border)? and never (got |been )?inspected",
        r"never (got |been )?inspected (at|when) (the border|i )",
        # Spanish
        r"cruc[eé] la frontera", r"sin papeles", r"indocumentad[oa]",
        # Simplified Chinese: no / unclear legal status
        r"没有身份", r"没有合法身份", r"无合法身份", r"非法居留", r"黑户",
    )),
]


_CRIMINAL_NEGATION = re.compile(
    r"\b(no|not any|without|do not have|don't have|never had|no prior|no past)\s+"
    r"(?:a\s+)?(criminal\s+)?(record|history|charges?|cases?)\b",
    re.IGNORECASE,
)
_CRIMINAL_DIRECT_RISK = _p(
    r"\barrest(ed)?\b", r"convict(ed|ion)", r"\bfelony\b", r"\bmisdemeanor\b",
    r"\bDUI\b", r"\bDWI\b", r"charged with", r"pled? guilty", r"on probation",
    r"crime of moral turpitude", r"aggravated felony", r"\bexpunge",
    r"\bin jail\b", r"\bin prison\b", r"served time",
    r"me arrestaron", r"me detuvo la polic[ií]a", r"antecedentes penales",
)


def _negates_criminal_history(blob):
    """Avoid false handoffs for disclosures like 'no criminal history' while
    still catching concrete risks such as arrests, convictions, DUI, or charges."""
    return bool(_CRIMINAL_NEGATION.search(blob)) and not _CRIMINAL_DIRECT_RISK.search(blob)


def detect_handoff(*texts):
    """Scan one or more free-text inputs for high-risk handoff triggers.

    Returns a dict. When a trigger is found::

        {"handoff": True,
         "category": "<first matched key>",
         "reasons": ["<human label>", ...],   # all matched categories, ordered
         "message": HANDOFF_MESSAGE}

    Otherwise ``{"handoff": False, "category": None, "reasons": [], "message": ""}``.
    """
    # Collapse runs of whitespace to single spaces so OCR'd / multiline text
    # ("removal\n\nproceeding", "removal   proceeding") still matches the
    # single-space patterns below. Safe: cannot create a false positive.
    blob = re.sub(r"\s+", " ", "\n".join(t for t in texts if isinstance(t, str) and t)).strip()
    if not blob:
        return {"handoff": False, "category": None, "reasons": [],
                "reason_keys": [], "message": ""}
    matched = []  # (key, label) in priority order
    for key, label, pattern in _PATTERNS:
        if key == "criminal_history" and _negates_criminal_history(blob):
            continue
        if pattern.search(blob):
            matched.append((key, label))
    if not matched:
        return {"handoff": False, "category": None, "reasons": [],
                "reason_keys": [], "message": ""}
    return {
        "handoff": True,
        "category": matched[0][0],
        "reasons": [label for _, label in matched],
        "reason_keys": [key for key, _ in matched],
        "message": HANDOFF_MESSAGE,
    }


# Minimum confidence the SEMANTIC layer must report before it is allowed to
# ESCALATE a regex no-handoff into a handoff. High on purpose: the semantic layer
# may only add safety, never noise, and false positives erode trust.
SEMANTIC_CONFIDENCE_THRESHOLD = 0.75


def _default_semantic(text):
    """Lazy bridge to the LLM semantic layer. Imported here (not at module top)
    so ``detect_handoff`` and the eval stay a pure, no-network, no-LLM path. Any
    failure degrades to unknown so the regex stays authoritative."""
    try:
        from handoff_semantic import semantic_handoff
        return semantic_handoff(text)
    except Exception:  # noqa: BLE001 — never let the optional layer break triage
        return {"handoff": None}


def triage_handoff(*texts, semantic=None):
    """Combined two-layer triage.

    Layer 1 (AUTHORITATIVE): the deterministic regex ``detect_handoff``. If it
    fires, we hand off and return immediately — the semantic layer can NEVER
    downgrade or override a deterministic handoff.

    Layer 2 (ADVISORY, escalate-only): if the regex says no-handoff AND a semantic
    layer is available AND it returns a high-confidence (>= 0.75) high-risk
    classification, we ALSO hand off. This catches euphemistic / indirect /
    mixed-language high-risk text the lexical layer misses.

    ``semantic`` is an injectable classifier ``fn(text) -> dict`` (used by tests to
    mock the LLM); when ``None`` the real ``handoff_semantic.semantic_handoff`` is
    used. A semantic result of ``{"handoff": None}`` (unknown / unavailable) is
    treated as "no opinion" and never changes the deterministic outcome.

    Return shape matches ``detect_handoff``; a semantic escalation additionally
    carries ``source: "semantic"`` and the semantic ``confidence``.
    """
    det = detect_handoff(*texts)
    if det["handoff"]:
        return det  # deterministic handoff is authoritative; never downgraded.

    blob = re.sub(r"\s+", " ",
                  "\n".join(t for t in texts if isinstance(t, str) and t)).strip()
    if not blob:
        return det

    sem_fn = semantic if semantic is not None else _default_semantic
    try:
        sem = sem_fn(blob)
    except Exception:  # noqa: BLE001
        return det
    if not isinstance(sem, dict) or sem.get("handoff") is not True:
        # None (unknown/unavailable) or False -> regex stays authoritative.
        return det
    try:
        conf = float(sem.get("confidence") or 0.0)
    except (TypeError, ValueError):
        return det
    if conf < SEMANTIC_CONFIDENCE_THRESHOLD:
        return det

    # Escalate. Map onto a known category so safe_prep() docs/urgency still apply.
    category = sem.get("category")
    if category not in _URGENCY:
        category = "unclear_no_status"
    reasons = sem.get("reasons")
    if not isinstance(reasons, list) or not reasons:
        reasons = ["situation flagged as high-risk by semantic review"]
    reasons = [str(r) for r in reasons]
    return {
        "handoff": True,
        "category": category,
        "reasons": reasons,
        "reason_keys": [category],
        "message": HANDOFF_MESSAGE,
        "source": "semantic",
        "confidence": conf,
    }


def build_handoff_response(kind, hand):
    """Shape a handoff result into the native response of a given endpoint.

    The payload always carries ``handoff: true`` (+ category/reasons/message) AND
    fills the endpoint's normal text field with ``HANDOFF_MESSAGE`` so the
    existing frontend renderer shows the safety message even with no frontend
    change. ``kind`` is one of: chat, pathway, stage-qa, document-review,
    interview.
    """
    msg = hand["message"]
    prep = safe_prep(hand)
    base = {"handoff": True, "category": hand["category"], "reasons": hand["reasons"],
            # Safe, non-advice next steps so a conservative hard stop still leaves
            # the user with something actionable (gaps: post-handoff help + avoid
            # over-refusal). None of this is legal advice.
            "urgency": prep["urgency"],
            "safe_prep": prep}
    reason_text = "Your situation involves: " + "; ".join(hand["reasons"]) + "."

    if kind == "chat":
        base.update({
            "content": [{"type": "text", "text": msg}],
            "choices": [{"message": {"role": "assistant", "content": msg}}],
            "model": None,
        })
    elif kind == "stage-qa":
        base["answer"] = msg
    elif kind == "pathway":
        base.update({
            "primaryPathway": "Needs licensed attorney review",
            "subcategory": "",
            "confidence": "low",
            "reasoning": reason_text + " " + msg,
            "nextSteps": [
                "Consult a licensed immigration attorney or a DOJ-accredited nonprofit.",
                "Find free or low-cost help by ZIP code at immigrationlawhelp.org.",
                "Do not file or sign anything until you have spoken with counsel.",
            ],
            "alternativePathways": [],
        })
    elif kind == "document-review":
        base.update({
            "overallStatus": "needs-attention",
            "issues": [{
                "severity": "high",
                "field": "Your situation",
                "problem": reason_text,
                "suggestion": "Have a licensed immigration attorney review your case "
                              "before you submit anything to USCIS.",
            }],
            "reminders": [msg],
        })
    elif kind == "interview":
        base.update({
            "coaching": {"level": "help", "note": msg},
            "nextQuestion": "",
            "done": True,
            "summary": reason_text + " A licensed immigration attorney should review this case.",
        })
    else:
        raise ValueError(f"unknown handoff response kind: {kind}")
    return base
