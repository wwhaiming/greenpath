#!/usr/bin/env python3
"""Semantic-handoff REPLAY harness (deterministic, no key, no network, no cost).

The semantic attorney-handoff layer (``handoff_semantic.semantic_handoff``)
normally calls a billable LLM and safe-degrades to ``{"handoff": None}`` when no
key is configured. That safe-degrade is correct, but it means the layer's *live
decision behavior* (parse the model JSON -> ``_coerce`` -> escalate-or-not in
``triage_handoff``) is otherwise invisible without paying for a key.

This harness proves that behavior offline by REPLAYING recorded model responses.
``semantic_handoff(text, client=...)`` accepts an injectable chat client; here we
inject a tiny mock that returns the recorded ``classifier_response`` for each
``text`` in ``evals/semantic_replay.json``. The recorded JSON flows through the
exact same ``json.loads`` + ``_coerce`` + threshold logic the real path uses, so
the assertions below exercise real decision code, not a re-implementation.

Contract under test (matches the module docstrings and tests/test_handoff.py):
  * high-risk euphemistic / indirect / mixed-language inputs that the regex
    MISSES are ESCALATED to a handoff by the semantic layer (source="semantic");
  * benign inputs are NOT escalated;
  * a deterministic (regex) handoff is NEVER downgraded by the semantic layer,
    even when the recorded semantic verdict is a high-confidence "false";
  * malformed model output degrades to "unknown" and changes nothing.

Usage:
    .venv/bin/python evals/semantic_replay.py
Exit code is non-zero if any recorded case violates the contract.
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, _ROOT)

from handoff import detect_handoff, triage_handoff, SEMANTIC_CONFIDENCE_THRESHOLD  # noqa: E402
from handoff_semantic import semantic_handoff  # noqa: E402

REPLAY_PATH = os.path.join(_HERE, "semantic_replay.json")


# ── Mock chat client mirroring the OpenAI SDK surface used by semantic_handoff ──
class _ReplayMessage:
    def __init__(self, content):
        self.content = content


class _ReplayChoice:
    def __init__(self, content):
        self.message = _ReplayMessage(content)


class _ReplayCompletion:
    def __init__(self, content):
        self.choices = [_ReplayChoice(content)]


class _ReplayCompletions:
    def __init__(self, content):
        self._content = content

    def create(self, *args, **kwargs):  # signature-compatible with the SDK
        return _ReplayCompletion(self._content)


class _ReplayChat:
    def __init__(self, content):
        self.completions = _ReplayCompletions(content)


class ReplayClient:
    """Returns one fixed raw-JSON ``content`` for any create() call, exactly like
    a recorded model response. ``content`` is the serialized recorded JSON, so the
    real parse/_coerce path runs unmodified."""

    def __init__(self, classifier_response):
        # Serialize to a JSON string: semantic_handoff does json.loads() on it,
        # so this drives the genuine parse path (incl. malformed-output handling).
        self.chat = _ReplayChat(json.dumps(classifier_response))


def load_cases(path=REPLAY_PATH):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)["cases"]


def check_case(case):
    """Run one recorded case through the real layers. Return (passed, problems)."""
    text = case["text"]
    client = ReplayClient(case["classifier_response"])

    # The injectable semantic fn used by triage_handoff: the REAL semantic_handoff
    # with the recorded response injected (no key, no network).
    def semantic(t):
        return semantic_handoff(t, client=client)

    det = detect_handoff(text)
    sem = semantic_handoff(text, client=client)
    tri = triage_handoff(text, semantic=semantic)

    problems = []

    # The regex layer must behave as labeled (proves these inputs really are
    # regex-misses for the high-risk/benign cases).
    if "expect_regex_handoff" in case:
        if det["handoff"] is not case["expect_regex_handoff"]:
            problems.append(
                f"regex handoff={det['handoff']} != expected {case['expect_regex_handoff']}")

    # INVARIANT (applies to every case): a deterministic handoff is never lost.
    if det["handoff"] and tri["handoff"] is not True:
        problems.append("DOWNGRADE: regex handoff was lost by triage")

    if tri["handoff"] is not case["expect_handoff"]:
        problems.append(
            f"triage handoff={tri['handoff']} != expected {case['expect_handoff']}")

    kind = case["kind"]
    if kind == "high_risk":
        if sem.get("handoff") is not True:
            problems.append(f"semantic_handoff did not classify high-risk (got {sem.get('handoff')})")
        if sem.get("confidence", 0.0) < SEMANTIC_CONFIDENCE_THRESHOLD:
            problems.append(f"recorded confidence {sem.get('confidence')} below threshold")
        if tri.get("source") != "semantic":
            problems.append(f"expected semantic escalation, source={tri.get('source')}")
        if "expect_category" in case and tri.get("category") != case["expect_category"]:
            problems.append(f"category={tri.get('category')} != {case['expect_category']}")
    elif kind == "benign":
        if sem.get("handoff") is not False:
            problems.append(f"benign case not classified false (got {sem.get('handoff')})")
        if tri.get("source") == "semantic":
            problems.append("benign case was wrongly escalated by semantic layer")
    elif kind == "regex_authoritative":
        # Deterministic hit must win and must NOT be tagged as a semantic escalation.
        if tri.get("source") == "semantic":
            problems.append("regex hit was overridden/tagged by the semantic layer")
        if "expect_category" in case and tri.get("category") != case["expect_category"]:
            problems.append(f"category={tri.get('category')} != {case['expect_category']}")
    elif kind == "degraded":
        # Malformed output must coerce to the unknown sentinel and change nothing.
        if sem.get("handoff") is not None:
            problems.append(f"malformed output did not degrade to unknown (got {sem.get('handoff')})")
        if tri.get("source") == "semantic":
            problems.append("degraded/unknown semantic result wrongly escalated")

    return (not problems), problems


def run(path=REPLAY_PATH):
    """Run all recorded cases. Return (passed, total, details)."""
    cases = load_cases(path)
    passed, details = 0, []
    for c in cases:
        ok, problems = check_case(c)
        passed += ok
        if not ok:
            details.append(f"  MISS [{c['id']}] {c['kind']}: " + "; ".join(problems))
    return passed, len(cases), details


def main():
    passed, total, details = run()
    print("=" * 60)
    print("GreenPath semantic-handoff REPLAY (no key, no network)")
    print("=" * 60)
    pct = 100.0 * passed / total if total else 0.0
    print(f"{'SEMANTIC REPLAY (recorded LLM verdicts)':<42} {passed}/{total}  {pct:5.1f}%")
    for d in details:
        print(d)
    print("-" * 60)
    if passed != total:
        print(f"FAIL: {total - passed} recorded case(s) violated the handoff contract")
        return 1
    print(f"PASS: all {total} recorded cases satisfy the handoff contract")
    return 0


if __name__ == "__main__":
    sys.exit(main())
