"""Seeded offline demo-mode tests (gap: no live key risks demo failure).

When GREENPATH_DEMO=1 and no key is configured, every AI route must return a
deterministic, source-backed, clearly-labeled sample instead of a 503 — and the
attorney-handoff safety stop must still run in front of it.

    .venv/bin/python -m pytest tests/test_demo.py -q
"""
import pytest

import server
import demo
from handoff import HANDOFF_MESSAGE


@pytest.fixture
def demo_client(monkeypatch):
    monkeypatch.setattr(server, "OPENAI_API_KEY", "")        # no live key
    monkeypatch.setenv("GREENPATH_DEMO", "1")                 # demo on
    server.app.config["TESTING"] = True
    return server.app.test_client()


def test_demo_enabled_flag(monkeypatch):
    monkeypatch.setenv("GREENPATH_DEMO", "1")
    assert demo.enabled() is True
    monkeypatch.setenv("GREENPATH_DEMO", "0")
    assert demo.enabled() is False


def test_chat_demo_returns_seeded(demo_client):
    d = demo_client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "How long does the I-485 take?"}]}).get_json()
    assert d["demo"] is True
    assert d["choices"][0]["message"]["content"]
    assert "legal advice" in d["choices"][0]["message"]["content"].lower()


def test_stage_qa_demo_has_real_corpus_citations(demo_client):
    d = demo_client.post("/api/stage-qa", json={
        "question": "Which form do I file for my spouse, the I-130?"}).get_json()
    assert d["demo"] is True and d["citations"]
    # Demo citations are still verbatim corpus sources (grounded, not invented).
    import rag
    corpus_quotes = {s["entry"]["quote"] for s in rag._CORPUS}
    assert all(c["quote"] in corpus_quotes for c in d["citations"])


def test_pathway_and_document_review_demo(demo_client):
    pw = demo_client.post("/api/pathway", json={"intake": "married to a US citizen"}).get_json()
    assert pw["demo"] is True and pw["primaryPathway"]
    dr = demo_client.post("/api/document-review", json={"document": "Form I-485 entries..."}).get_json()
    assert dr["demo"] is True and dr["overallStatus"]


def test_demo_does_not_bypass_handoff(demo_client):
    d = demo_client.post("/api/stage-qa", json={
        "question": "I was convicted of a felony, can I still get a green card?"}).get_json()
    assert d["handoff"] is True and d["answer"] == HANDOFF_MESSAGE
    assert d.get("demo") is not True  # handoff response, not a demo answer


def test_no_demo_no_key_is_503(monkeypatch):
    monkeypatch.setattr(server, "OPENAI_API_KEY", "")
    monkeypatch.delenv("GREENPATH_DEMO", raising=False)
    server.app.config["TESTING"] = True
    c = server.app.test_client()
    r = c.post("/api/chat", json={"messages": [{"role": "user", "content": "hi there"}]})
    assert r.status_code == 503
