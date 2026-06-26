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


# Ordered: the first matching category becomes the reported ``category``.
# Each entry: (key, human-readable label, compiled pattern).
# Word boundaries (\b) guard short tokens (NTA, EWI, DUI, CAT) from matching
# inside unrelated words.
_PATTERNS = [
    ("removal_proceedings", "removal or deportation proceedings", _p(
        r"removal proceeding", r"\bdeport(ed|ation|able)?\b", r"immigration court",
        r"notice to appear", r"\bNTA\b", r"order of removal", r"final order of",
        r"ICE (detain|custody|hold|arrest)", r"\bdetained by\b", r"in proceedings",
    )),
    ("criminal_history", "a criminal record or arrest", _p(
        r"\barrest(ed)?\b", r"convict(ed|ion)", r"criminal (record|history|charge|case)",
        r"\bfelony\b", r"\bmisdemeanor\b", r"\bDUI\b", r"\bDWI\b",
        r"charged with", r"pled? guilty", r"on probation",
        r"crime of moral turpitude", r"aggravated felony", r"\bexpunge",
        r"\bin jail\b", r"\bin prison\b", r"served time",
    )),
    ("fraud_misrepresentation", "possible fraud or misrepresentation", _p(
        r"misrepresent", r"\bfraud", r"fake (document|passport|id|marriage)",
        r"false (information|statement|document|claim)", r"forg(ed|ery)",
        r"lied (on|to|about)", r"falsifi", r"\bsham marriage\b",
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
    )),
    ("overstay_unlawful_presence", "an overstay or unlawful presence", _p(
        r"overstay", r"out of status", r"fell out of status", r"lost my status",
        r"unlawful(ly)? presen", r"unauthorized presence",
        r"stayed (past|beyond|longer than|after)",
        r"visa (has )?expired", r"expired visa", r"my (visa|i-?94) expired",
    )),
    ("unclear_no_status", "unclear or no current legal status", _p(
        r"undocumented", r"no legal status", r"\bno papers\b", r"unclear (legal )?status",
        r"entered without inspection", r"\bEWI\b", r"crossed the border",
        r"here illegally", r"illegally in the", r"snuck (in|into|across)",
    )),
]


def detect_handoff(*texts):
    """Scan one or more free-text inputs for high-risk handoff triggers.

    Returns a dict. When a trigger is found::

        {"handoff": True,
         "category": "<first matched key>",
         "reasons": ["<human label>", ...],   # all matched categories, ordered
         "message": HANDOFF_MESSAGE}

    Otherwise ``{"handoff": False, "category": None, "reasons": [], "message": ""}``.
    """
    blob = "\n".join(t for t in texts if isinstance(t, str) and t)
    if not blob:
        return {"handoff": False, "category": None, "reasons": [], "message": ""}
    matched = []  # (key, label) in priority order
    for key, label, pattern in _PATTERNS:
        if pattern.search(blob):
            matched.append((key, label))
    if not matched:
        return {"handoff": False, "category": None, "reasons": [], "message": ""}
    return {
        "handoff": True,
        "category": matched[0][0],
        "reasons": [label for _, label in matched],
        "message": HANDOFF_MESSAGE,
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
    base = {"handoff": True, "category": hand["category"], "reasons": hand["reasons"]}
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
