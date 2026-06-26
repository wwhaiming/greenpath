"""Unit tests for the deterministic attorney-handoff detector.

Two responsibilities are pinned here:
  1. RECALL  - every high-risk category fires on a realistic dangerous phrase.
  2. PRECISION - benign, everyday immigration questions do NOT fire. False
     positives would block the primary journey and erode trust, which the spec
     explicitly forbids, so the negative cases are as important as the positive.

Pure module: no Flask, no network, no LLM. Run:
    .venv/bin/python -m pytest tests/test_handoff.py -q
"""
import pytest

from handoff import detect_handoff, build_handoff_response, HANDOFF_MESSAGE


# ── RECALL: each category must trigger ───────────────────────────────────────

TRIGGERS = [
    ("removal_proceedings",        "I have a removal proceeding and a notice to appear in immigration court."),
    ("removal_proceedings",        "I was deported five years ago and want to come back."),
    ("criminal_history",           "I was convicted of a felony, can I still apply?"),
    ("criminal_history",           "I got a DUI last year, does that affect my case?"),
    ("fraud_misrepresentation",    "I used a fake passport to enter, am I in trouble?"),
    ("asylum_one_year_deadline",   "I want to apply for asylum because I fear persecution."),
    ("vawa_u_t_visa",              "My husband abused me and I heard about a U-visa."),
    ("inadmissibility_bars",       "Do I need an i-601 waiver for the ten-year bar?"),
    ("prior_visa_denial",          "My visa was denied at the consulate and put in administrative processing."),
    ("unauthorized_work",          "I worked without authorization for two years on a tourist visa."),
    ("overstay_unlawful_presence", "I overstayed my visa and I'm now out of status."),
    ("unclear_no_status",          "I'm undocumented and entered without inspection."),
]


@pytest.mark.parametrize("expected_category, text", TRIGGERS)
def test_high_risk_text_triggers_handoff(expected_category, text):
    r = detect_handoff(text)
    assert r["handoff"] is True, f"should have triggered: {text!r}"
    # The first-matched category should be the expected one (priority order).
    assert r["category"] == expected_category, \
        f"{text!r} -> {r['category']} (reasons: {r['reasons']})"
    assert r["reasons"] and r["message"] == HANDOFF_MESSAGE


# ── PRECISION: benign questions must NOT trigger ─────────────────────────────

BENIGN = [
    "How long does the I-485 take to process right now?",
    "What documents do I need for a marriage-based green card?",
    "I'm not sure which form to use, can you help me figure it out?",
    "Is there a fee waiver available for the application fee?",
    "Can I travel on advance parole while my case is pending?",
    "My visa expires next year, when should I start the renewal?",
    "What is the difference between EB-2 and EB-3?",
    "How do I check my case status online with my receipt number?",
    "What does my priority date mean on the visa bulletin?",
    "Do I need a medical exam before my green card interview?",
    "Can I include my children on my application?",
    "How much does it cost to file Form I-130?",
]


@pytest.mark.parametrize("text", BENIGN)
def test_benign_text_does_not_trigger(text):
    r = detect_handoff(text)
    assert r["handoff"] is False, f"FALSE POSITIVE on benign text: {text!r}"


def test_empty_input_does_not_trigger():
    assert detect_handoff()["handoff"] is False
    assert detect_handoff("", None, "")["handoff"] is False
    assert detect_handoff(None)["handoff"] is False


def test_multiple_categories_collected_in_reasons():
    r = detect_handoff("I overstayed my visa and was convicted of a crime.")
    assert r["handoff"] is True
    assert len(r["reasons"]) >= 2  # overstay + criminal


# ── build_handoff_response: shape per endpoint ───────────────────────────────

def test_build_handoff_response_shapes():
    hand = detect_handoff("I have a deportation order.")
    chat = build_handoff_response("chat", hand)
    assert chat["handoff"] is True
    assert chat["choices"][0]["message"]["content"] == HANDOFF_MESSAGE
    assert chat["content"][0]["text"] == HANDOFF_MESSAGE

    qa = build_handoff_response("stage-qa", hand)
    assert qa["handoff"] is True and qa["answer"] == HANDOFF_MESSAGE

    pw = build_handoff_response("pathway", hand)
    assert pw["handoff"] is True
    assert pw["primaryPathway"] == "Needs licensed attorney review"
    assert pw["confidence"] == "low" and pw["nextSteps"]

    dr = build_handoff_response("document-review", hand)
    assert dr["handoff"] is True and dr["overallStatus"] == "needs-attention"
    assert dr["issues"][0]["severity"] == "high"

    iv = build_handoff_response("interview", hand)
    assert iv["handoff"] is True and iv["done"] is True
    assert iv["coaching"]["level"] == "help"


def test_build_handoff_response_unknown_kind_raises():
    hand = detect_handoff("I have a deportation order.")
    with pytest.raises(ValueError):
        build_handoff_response("totally-unknown", hand)
