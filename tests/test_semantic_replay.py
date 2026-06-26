"""Deterministic replay of the SEMANTIC attorney-handoff layer.

These tests prove the semantic layer's LIVE decision behavior WITHOUT a billable
key and WITHOUT any network call, by injecting recorded model responses (from
``evals/semantic_replay.json``) into ``handoff_semantic.semantic_handoff`` via its
optional ``client`` argument. The recorded JSON flows through the real
parse/_coerce/threshold path, so this exercises production decision code.

Contract: high-risk euphemistic / indirect / mixed-language inputs escalate;
benign inputs do not; and a deterministic (regex) handoff is never downgraded.
"""
import json
import os
import sys

import pytest

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
sys.path.insert(0, os.path.join(_ROOT, "evals"))

from handoff_semantic import semantic_handoff  # noqa: E402
import semantic_replay as sr  # noqa: E402

_CASES = sr.load_cases()


def test_replay_dataset_is_present_and_covers_both_classes():
    kinds = {c["kind"] for c in _CASES}
    assert "high_risk" in kinds, "need recorded high-risk inputs"
    assert "benign" in kinds, "need recorded benign inputs"
    assert "regex_authoritative" in kinds, "need a no-downgrade fixture"
    # High-risk fixtures must span euphemistic English AND a non-English/mixed input.
    texts = " ".join(c["text"] for c in _CASES if c["kind"] == "high_risk")
    assert any(ord(ch) > 0x3000 for ch in texts) or "migra" in texts, \
        "high-risk fixtures should include a mixed/non-English example"


@pytest.mark.parametrize("case", _CASES, ids=[c["id"] for c in _CASES])
def test_recorded_case_satisfies_handoff_contract(case):
    ok, problems = sr.check_case(case)
    assert ok, f"{case['id']}: " + "; ".join(problems)


def test_runner_reports_all_cases_passing():
    passed, total, details = sr.run()
    assert passed == total, "replay runner found contract violations:\n" + "\n".join(details)
    assert total >= 6


def test_injected_client_drives_real_parse_path_not_a_stub():
    # Prove the recorded raw JSON actually goes through json.loads + _coerce: a
    # confidence > 1.0 in the recorded payload must be clamped to <= 1.0 by _coerce.
    client = sr.ReplayClient({"handoff": True, "category": "criminal_history",
                              "confidence": 9.0, "reasons": ["x"]})
    out = semantic_handoff("some indirect risky disclosure", client=client)
    assert out["handoff"] is True
    assert out["confidence"] == 1.0  # clamped by the real _coerce, not echoed


def test_safe_degrade_unchanged_without_key_and_without_client(monkeypatch):
    # Core safety contract must be untouched: no key + no injected client -> unknown.
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    out = semantic_handoff("They took my brother to the detention center.")
    assert out == {"handoff": None, "category": None, "confidence": 0.0, "reasons": []}
