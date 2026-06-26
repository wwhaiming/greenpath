"""Tests for retrieval-backed citations.

Covers (1) deterministic lexical retrieve() relevance and (2) the invariant that
every citation the API returns is a verbatim source from the on-disk corpus —
never model-invented text — including the empty-citations path for off-topic
questions. The LLM is mocked; no network is used.

    .venv/bin/python -m pytest tests/ -q
"""
import pytest

import rag
import server


# Ground-truth set of (url, quote) pairs straight from the corpus on disk.
_CORPUS_PAIRS = {(s['entry']['url'], s['entry']['quote']) for s in rag._CORPUS}
_CORPUS_QUOTES = {s['entry']['quote'] for s in rag._CORPUS}


# ── retrieve() relevance ─────────────────────────────────────────────────────

def test_retrieve_form_number_ranks_matching_form_first():
    out = rag.retrieve("How do I replace my green card with Form I-90?")
    assert out, "expected hits for an I-90 question"
    assert "/i-90" in out[0]["url"]


def test_retrieve_naturalization_hits_n400():
    out = rag.retrieve("naturalization process to become a citizen")
    assert out and any("/n-400" in s["url"] for s in out)


def test_retrieve_respects_k():
    assert len(rag.retrieve("fee form uscis application", k=2)) <= 2
    assert len(rag.retrieve("fee form uscis application", k=3)) <= 3


def test_retrieve_offtopic_returns_empty():
    assert rag.retrieve("xyzzy quantum banana spaceship") == []


def test_retrieve_blank_or_nonstring_returns_empty():
    assert rag.retrieve("") == []
    assert rag.retrieve("   ") == []
    assert rag.retrieve(None) == []


def test_retrieve_is_deterministic():
    q = "I-485 adjust status priority date visa bulletin"
    assert rag.retrieve(q) == rag.retrieve(q)


def test_retrieve_results_are_verbatim_corpus_sources():
    for s in rag.retrieve("I-130 petition for my spouse and the filing fee", k=3):
        assert (s["url"], s["quote"]) in _CORPUS_PAIRS


def test_as_citation_shape_and_verbatim():
    s = rag.retrieve("naturalization fee")[0]
    c = rag.as_citation(s)
    assert set(c) == {"title", "url", "retrieved_at", "quote"}
    assert c["quote"] in _CORPUS_QUOTES


def test_build_sources_block_empty_when_no_sources():
    assert rag.build_sources_block([]) == ""


# ── /api/stage-qa citations come only from the corpus ────────────────────────

class _FakeResp:
    def __init__(self, content):
        msg = type("M", (), {"content": content})
        self.choices = [type("C", (), {"message": msg})]


def _mock_create(captured):
    def create(**kwargs):
        captured.update(kwargs)
        return _FakeResp(captured.get("_reply", "answer text"))
    return create


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


def test_stage_qa_returns_corpus_citations(client, monkeypatch):
    cap = {"_reply": "Use Form I-130 for your spouse."}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create(cap))
    d = client.post("/api/stage-qa", json={
        "pathway": "Family-based", "stage": "Filing the petition",
        "question": "Which form do I file for my spouse, the I-130?"}).get_json()
    assert "answer" in d and isinstance(d["citations"], list)
    assert d["citations"], "expected citations for an on-topic I-130 question"
    for c in d["citations"]:
        assert set(c) == {"title", "url", "retrieved_at", "quote"}
        # Every citation is verbatim from the corpus — not model-invented.
        assert c["quote"] in _CORPUS_QUOTES
    # The verbatim quotes were actually injected into the system prompt.
    sys_msg = cap["messages"][0]["content"]
    assert d["citations"][0]["quote"] in sys_msg


def test_stage_qa_offtopic_has_empty_citations(client, monkeypatch):
    cap = {"_reply": "General guidance only."}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create(cap))
    d = client.post("/api/stage-qa", json={
        "question": "What is the weather like in Norway today?"}).get_json()
    assert d["answer"] and d["citations"] == []
