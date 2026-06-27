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

from handoff import (
    detect_handoff,
    triage_handoff,
    build_handoff_response,
    HANDOFF_MESSAGE,
    SEMANTIC_CONFIDENCE_THRESHOLD,
)
import handoff_semantic


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
    # ── paraphrase / euphemism English ──
    ("removal_proceedings",        "I got picked up by immigration last week."),
    ("removal_proceedings",        "They gave me papers to see a judge."),
    ("removal_proceedings",        "I got a letter to appear in court next month."),
    ("fraud_misrepresentation",    "I used someone else's SSN to get hired."),
    ("unauthorized_work",          "I worked cash jobs for a few years."),
    ("unclear_no_status",          "I crossed and never got inspected."),
    # ── Spanish (accent + no-accent) ──
    ("removal_proceedings",        "Me deportaron el año pasado y quiero volver."),
    ("removal_proceedings",        "Tengo una orden de deportación."),
    ("removal_proceedings",        "Tengo una orden de deportacion."),  # no accent
    ("removal_proceedings",        "Tengo que ir a la corte de inmigración."),
    ("criminal_history",           "Me arrestaron la semana pasada."),
    ("overstay_unlawful_presence", "Mi visa venció hace dos años."),
    ("overstay_unlawful_presence", "Mi visa expiro el mes pasado."),  # no accent
    ("unclear_no_status",          "Crucé la frontera sin papeles."),
    ("unclear_no_status",          "Soy indocumentado y no tengo estatus."),
    # ── Simplified Chinese ──
    ("removal_proceedings",        "我被驱逐出境了。"),
    ("overstay_unlawful_presence", "我的签证逾期居留了。"),
    ("unclear_no_status",          "我没有合法身份。"),
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
    # ── multilingual / paraphrase benign (must NOT trigger) ──
    "¿Cuánto tarda el I-485 en procesarse?",
    "¿Necesito un examen médico antes de la entrevista?",
    "¿Cuánto cuesta presentar el formulario I-130?",
    "¿Qué documentos necesito para la green card por matrimonio?",
    "我做绿卡面试前需要做体检吗？",
    "I-485 大概需要多久才能批准？",
    "I picked up my green card from the mailbox yesterday.",
    "I got a letter from USCIS about my biometrics appointment.",
    "I worked a part-time job at a coffee shop with my work permit.",
    "Mi visa expira el próximo año, ¿cuándo debo renovarla?",
    "I have no criminal history.",
    "I do not have a criminal record.",
    "I am married to a U.S. citizen and entered on a tourist visa that has since expired. I have no criminal history.",
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


# ── triage_handoff: two-layer combined detection (semantic layer MOCKED) ─────
# The semantic layer is an injectable fn(text)->dict so these tests NEVER need a
# key or a network call. The contract under test:
#   * deterministic regex is AUTHORITATIVE and is never downgraded;
#   * semantic may only ESCALATE a regex no-handoff, and only at high confidence;
#   * an "unknown" ({"handoff": None}) semantic result changes nothing.

def _sem(handoff, confidence=0.9, category="criminal_history", reasons=("x",)):
    """Build a fake semantic classifier returning a fixed verdict."""
    return lambda text: {"handoff": handoff, "confidence": confidence,
                         "category": category, "reasons": list(reasons)}


def test_triage_regex_hit_is_authoritative_and_never_consults_semantic():
    calls = {"n": 0}

    def semantic(text):
        calls["n"] += 1
        return {"handoff": False, "confidence": 0.99}  # tries to DOWNGRADE
    r = triage_handoff("I have a deportation order.", semantic=semantic)
    assert r["handoff"] is True                 # regex stays authoritative
    assert r["category"] == "removal_proceedings"
    assert calls["n"] == 0                       # semantic not even called


def test_triage_semantic_cannot_downgrade_a_regex_handoff():
    # Even if the semantic layer is force-called with a "no", a regex hit wins.
    r = triage_handoff("I was convicted of a felony.", semantic=_sem(False, 0.99))
    assert r["handoff"] is True
    assert r.get("source") != "semantic"


def test_triage_semantic_escalates_when_regex_misses_high_confidence():
    text = "They took my brother to the detention center last week."
    assert detect_handoff(text)["handoff"] is False           # regex misses it
    r = triage_handoff(text, semantic=_sem(True, 0.9, "removal_proceedings"))
    assert r["handoff"] is True
    assert r["source"] == "semantic"
    assert r["category"] == "removal_proceedings"
    assert r["message"] == HANDOFF_MESSAGE
    assert r["confidence"] >= SEMANTIC_CONFIDENCE_THRESHOLD


def test_triage_semantic_below_threshold_does_not_escalate():
    text = "Just a vague worry about my paperwork."
    r = triage_handoff(text, semantic=_sem(True, 0.5))         # low confidence
    assert r["handoff"] is False


def test_triage_semantic_unknown_keeps_regex_result():
    text = "How long does the I-485 take to process right now?"
    r = triage_handoff(text, semantic=lambda t: {"handoff": None})
    assert r["handoff"] is False


def test_triage_semantic_false_keeps_benign():
    text = "What documents do I need for a marriage-based green card?"
    r = triage_handoff(text, semantic=_sem(False, 0.99))
    assert r["handoff"] is False


def test_triage_semantic_exception_degrades_to_regex():
    def boom(text):
        raise RuntimeError("LLM exploded")
    # Regex no-handoff + semantic raising must NOT crash; stays no-handoff.
    assert triage_handoff("benign question about fees", semantic=boom)["handoff"] is False
    # And a regex hit still hands off regardless of a broken semantic layer.
    assert triage_handoff("I have a deportation order.", semantic=boom)["handoff"] is True


def test_triage_semantic_unknown_category_maps_to_safe_default():
    r = triage_handoff("some indirect risky thing",
                       semantic=_sem(True, 0.95, category="not_a_real_key"))
    assert r["handoff"] is True
    assert r["category"] == "unclear_no_status"   # mapped onto a known key
    # build_handoff_response + safe_prep must work on a semantic-escalated hand.
    resp = build_handoff_response("chat", r)
    assert resp["handoff"] is True
    assert resp["choices"][0]["message"]["content"] == HANDOFF_MESSAGE
    assert resp["safe_prep"]["documents_to_gather"]


def test_triage_empty_input_no_handoff_and_no_semantic_call():
    calls = {"n": 0}

    def semantic(text):
        calls["n"] += 1
        return {"handoff": True, "confidence": 1.0}
    assert triage_handoff("", "  ", semantic=semantic)["handoff"] is False
    assert calls["n"] == 0


# ── semantic_handoff: safe degradation + parsing (LLM client MOCKED) ─────────

class _FakeChatResp:
    def __init__(self, content):
        msg = type("M", (), {"content": content})
        self.choices = [type("C", (), {"message": msg})]


class _FakeClient:
    def __init__(self, content):
        self._content = content
        outer = self

        class _Completions:
            def create(self, **kwargs):
                return _FakeChatResp(outer._content)
        self.chat = type("Chat", (), {"completions": _Completions()})()


def test_semantic_handoff_no_key_returns_unknown(monkeypatch):
    # No client (no key) -> degrade to unknown so the regex stays authoritative.
    monkeypatch.setattr(handoff_semantic, "_build_client", lambda: None)
    r = handoff_semantic.semantic_handoff("I was deported and want to return.")
    assert r["handoff"] is None
    assert r["confidence"] == 0.0


def test_semantic_handoff_empty_text_returns_unknown():
    assert handoff_semantic.semantic_handoff("")["handoff"] is None
    assert handoff_semantic.semantic_handoff(None)["handoff"] is None


def test_semantic_handoff_parses_valid_json(monkeypatch):
    payload = ('{"handoff": true, "category": "removal_proceedings", '
               '"confidence": 0.92, "reasons": ["mentions detention center"]}')
    monkeypatch.setattr(handoff_semantic, "_build_client",
                        lambda: _FakeClient(payload))
    r = handoff_semantic.semantic_handoff("they took him to the detention center")
    assert r["handoff"] is True
    assert r["category"] == "removal_proceedings"
    assert r["confidence"] == pytest.approx(0.92)
    assert r["reasons"] == ["mentions detention center"]


def test_semantic_handoff_malformed_json_degrades(monkeypatch):
    monkeypatch.setattr(handoff_semantic, "_build_client",
                        lambda: _FakeClient("not json at all"))
    assert handoff_semantic.semantic_handoff("anything")["handoff"] is None


def test_semantic_handoff_clamps_confidence_and_unknown_category(monkeypatch):
    payload = ('{"handoff": true, "category": "bogus", "confidence": 5.0, '
               '"reasons": "single string"}')
    monkeypatch.setattr(handoff_semantic, "_build_client",
                        lambda: _FakeClient(payload))
    r = handoff_semantic.semantic_handoff("text")
    assert r["handoff"] is True
    assert r["confidence"] == 1.0           # clamped to [0,1]
    assert r["category"] is None            # unknown key dropped
    assert r["reasons"] == ["single string"]


def test_semantic_handoff_client_error_degrades(monkeypatch):
    class _BoomClient:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    raise RuntimeError("network down")
    monkeypatch.setattr(handoff_semantic, "_build_client", lambda: _BoomClient())
    assert handoff_semantic.semantic_handoff("text")["handoff"] is None
