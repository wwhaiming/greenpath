"""RAG coverage + insufficiency tests (gap: narrow corpus, model-only restraint).

Proves the corpus is tagged by pathway/stage, that retrieval surfaces those tags,
and that 'sources insufficient' is exposed explicitly to the API/UI rather than
left to model restraint.

    .venv/bin/python -m pytest tests/test_rag_coverage.py -q
"""
import pytest

import rag
import server


# ── Pathway/stage tagging ────────────────────────────────────────────────────

def test_corpus_entries_are_tagged():
    out = rag.retrieve("naturalization to become a citizen")
    assert out and "naturalization" in out[0].get("pathways", [])


def test_family_query_tagged():
    out = rag.retrieve("I-130 petition for my spouse")
    assert any("family" in s.get("pathways", []) for s in out)


def test_coverage_summary():
    out = rag.retrieve("priority date visa bulletin when current", k=3)
    cov = rag.coverage(out)
    assert "priority-date" in cov["stages"]
    assert cov["count"] == len(out)


# ── Insufficiency detection ──────────────────────────────────────────────────

def test_insufficient_when_no_hits():
    assert rag.is_insufficient(rag.retrieve("xyzzy quantum banana spaceship")) is True


def test_sufficient_for_strong_form_query():
    assert rag.is_insufficient(rag.retrieve("Form I-90 replace green card")) is False


def test_weak_single_overlap_is_insufficient():
    # A made-up source list whose best lexical score is 1 (weak) reads insufficient.
    assert rag.is_insufficient([{"score": 1}]) is True
    assert rag.is_insufficient([{"score": 2}]) is False


# ── Server surfaces sufficiency explicitly ───────────────────────────────────

class _FakeResp:
    def __init__(self, content):
        msg = type("M", (), {"content": content})
        self.choices = [type("C", (), {"message": msg})]


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


def test_stage_qa_exposes_sufficiency(client, monkeypatch):
    monkeypatch.setattr(server.client.chat.completions, "create",
                        lambda **k: _FakeResp("Use Form I-130. Always verify at uscis.gov."))
    d = client.post("/api/stage-qa", json={
        "question": "Which form do I file for my spouse, the I-130?"}).get_json()
    assert d["sources_sufficient"] is True
    assert "family" in d["source_coverage"]["pathways"]
    assert "insufficient_notice" not in d


def test_stage_qa_flags_insufficient(client, monkeypatch):
    monkeypatch.setattr(server.client.chat.completions, "create",
                        lambda **k: _FakeResp("General info. Verify at uscis.gov."))
    d = client.post("/api/stage-qa", json={
        "question": "What is the weather in Norway today?"}).get_json()
    assert d["sources_sufficient"] is False
    assert d["citations"] == []
    assert "insufficient_notice" in d


def test_pathway_exposes_sufficiency(client, monkeypatch):
    monkeypatch.setattr(server.client.chat.completions, "create",
                        lambda **k: _FakeResp('{"primaryPathway": "Family-based"}'))
    d = client.post("/api/pathway", json={"intake": "married to a US citizen, filing I-130"}).get_json()
    assert "sources_sufficient" in d and "source_coverage" in d
