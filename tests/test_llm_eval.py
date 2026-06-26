"""Tests for the property-based LLM eval grading logic (evals/eval.py).

The live eval (``evals/eval.py --live``) only runs when ``OPENAI_API_KEY`` is set
and makes real, billable model calls — so its *grading logic* would otherwise be
untested. These tests exercise that grading logic deterministically against a
MOCKED model (no key, no network): we drive the real Flask route via a test
client, swap the OpenAI client for a fake that returns controlled replies, and
assert that the property scorer (refusal correctness, citations-only-from-corpus,
no-legal-advice, language) returns the right pass/fail verdicts.

This proves the eval measures MODEL behavior, not just deterministic scaffolding:
a well-behaved model passes every declared property, and a misbehaving model is
caught by the same scorer.
"""
import importlib.util
import json
import os

import pytest

import server

# Load evals/eval.py as a module (it lives outside tests/ and is not a package).
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
_EVAL_PATH = os.path.join(_ROOT, "evals", "eval.py")
_spec = importlib.util.spec_from_file_location("greenpath_eval", _EVAL_PATH)
gp_eval = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gp_eval)

_CASES = gp_eval._load_cases(os.path.join(_ROOT, "evals", "llm_cases.json"))["cases"]
_ANSWER_CASES = [c for c in _CASES if not c.get("must_refuse")]
_REFUSE_CASES = [c for c in _CASES if c.get("must_refuse")]


class _FakeResp:
    """Minimal stand-in for an OpenAI chat completion response."""

    def __init__(self, content):
        msg = type("M", (), {"content": content})
        self.choices = [type("C", (), {"message": msg})]


def _client():
    server.app.config["TESTING"] = True  # skip rate limiter; same-origin OK
    return server.app.test_client()


def _good_reply_for(case):
    """Build the structured reply a WELL-BEHAVED model would emit for an
    answerable case: a verbatim quote copied from the top retrieved corpus source
    (so a real citation is produced), an answer that points the user to uscis.gov,
    no legal-advice red-flag phrases, and text in the case's expected language."""
    sources = server._retrieve_sources(
        case["question"], case.get("pathway", "General"), case.get("stage", "General"))
    assert sources, f"expected retrieval to surface corpus sources for {case['id']!r}"
    quote = (sources[0].get("quote") or "").strip()
    assert quote, f"top source for {case['id']!r} has no quote to ground a claim"
    snippet = quote[:60]  # verbatim substring of a real corpus quote

    if case.get("language") == "es":
        answer = ("Esta es informacion general basada en las fuentes oficiales para "
                  "su situacion. Siempre verifique los requisitos actuales en "
                  "uscis.gov antes de actuar.")
    else:
        answer = ("Here is general information based on official sources for your "
                  "situation. Always verify current requirements at uscis.gov "
                  "before taking action.")
    return json.dumps({
        "answer": answer,
        "claims": [{"text": "General information.",
                    "source_ids": [1], "quote_used": snippet}],
    })


def _set_model_reply(monkeypatch, reply):
    monkeypatch.setattr(server.client.chat.completions, "create",
                        lambda reply=reply, **k: _FakeResp(reply))


# ── A well-behaved model passes every declared property ──────────────────────

@pytest.mark.parametrize("case", _ANSWER_CASES, ids=[c["id"] for c in _ANSWER_CASES])
def test_good_model_passes_all_properties(monkeypatch, case):
    _set_model_reply(monkeypatch, _good_reply_for(case))
    checks = gp_eval._scores_for_live_case(_client(), case)
    assert checks, f"{case['id']}: scorer returned no checks"
    # Every property the case declares must be scored AND pass.
    declared = set()
    if case.get("must_cite"):
        declared.add("must_cite")
    if case.get("must_not_give_legal_advice"):
        declared.add("must_not_give_legal_advice")
    if "language" in case:
        declared.add(f"language=={case['language']}")
    scored = {name for name, _ in checks}
    assert declared <= scored, f"{case['id']}: missing checks {declared - scored}"
    for name, ok in checks:
        assert ok, f"{case['id']} :: {name} should pass for a well-behaved model"


# ── must_refuse cases: scorer requires the deterministic handoff stop ────────

@pytest.mark.parametrize("case", _REFUSE_CASES, ids=[c["id"] for c in _REFUSE_CASES])
def test_refusal_cases_require_handoff(monkeypatch, case):
    # No model should ever be called on a refusal case; make the model EXPLODE so
    # the test fails loudly if the handoff stop is bypassed.
    def _boom(**k):
        raise AssertionError("model must not be called on a must_refuse case")

    monkeypatch.setattr(server.client.chat.completions, "create", _boom)
    checks = gp_eval._scores_for_live_case(_client(), case)
    assert ("must_refuse", True) in checks
    if case.get("must_not_give_legal_advice"):
        assert ("must_not_give_legal_advice", True) in checks


# ── The scorer CATCHES a misbehaving model (this is what proves it works) ────

def test_scorer_flags_legal_advice(monkeypatch):
    """A model reply that gives individualized legal advice (outcome prediction +
    'file Form X') and omits the uscis.gov verify pointer must FAIL the
    must_not_give_legal_advice property, while a correctly-scored property such as
    language stays True (the scorer isolates the failing property)."""
    case = next(c for c in _ANSWER_CASES
                if c.get("must_not_give_legal_advice") and c.get("language") == "en")
    bad = "You are eligible and you will be approved. You should file Form I-130 today."
    _set_model_reply(monkeypatch, bad)
    checks = dict(gp_eval._scores_for_live_case(_client(), case))
    assert checks.get("must_not_give_legal_advice") is False
    assert checks.get("language==en") is True


def test_scorer_flags_wrong_language(monkeypatch):
    """An answerable Spanish case answered in English must fail its language
    property (the scorer measures the actual reply language, not the request)."""
    case = next(c for c in _ANSWER_CASES if c.get("language") == "es")
    # English prose, with the uscis.gov pointer so ONLY language can fail.
    _set_model_reply(monkeypatch, json.dumps({
        "answer": ("This is general information based on official sources. Always "
                   "verify current requirements at uscis.gov before taking action."),
        "claims": [],
    }))
    checks = dict(gp_eval._scores_for_live_case(_client(), case))
    assert checks.get("language==es") is False


# ── 503 (model unreachable) is reported as SKIP, never as silent failures ────

def test_unreachable_model_raises_live_unavailable(monkeypatch):
    """When the route returns 503 (key missing/invalid), the scorer raises
    _LiveUnavailable so eval_live SKIPS rather than reporting misleading misses."""
    case = next(c for c in _ANSWER_CASES)
    monkeypatch.setattr(server, "OPENAI_API_KEY", "")  # force the 503 unconfigured branch
    monkeypatch.setattr(server, "LOCAL_ONLY", False)
    monkeypatch.setattr(server.demo, "enabled", lambda: False)
    with pytest.raises(gp_eval._LiveUnavailable):
        gp_eval._scores_for_live_case(_client(), case)


def test_eval_live_returns_none_without_key(monkeypatch):
    """Without OPENAI_API_KEY the live suite is not applicable: eval_live returns
    None so the deterministic gate is reported unchanged (never failed)."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert gp_eval.eval_live(_CASES) is None
