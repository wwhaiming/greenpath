"""Security / safety wiring tests for the GreenPath backend.

Proves three protections actually fire at the HTTP boundary:
  1. Attorney-handoff hard stop is wired into every LLM endpoint and returns
     BEFORE any (billable) model call.
  2. The same-origin guard rejects cross-site browser calls to billable routes.
  3. The sliding-window rate limiter returns 429 past the cap.

The LLM is mocked: handoff cases never reach it (we assert the model is never
called), and benign cases get a canned reply.

    .venv/bin/python -m pytest tests/test_security.py -q
"""
import pytest

import server
from handoff import HANDOFF_MESSAGE


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    server.app.config["ENFORCE_RATE_LIMIT"] = False
    server._rate_hits.clear()
    return server.app.test_client()


class _FakeResp:
    def __init__(self, content):
        msg = type("M", (), {"content": content})
        self.choices = [type("C", (), {"message": msg})]


def _mock_create_counter(box):
    """Mock that records that the LLM WAS called (so handoff tests can assert it
    was NOT)."""
    def create(**kwargs):
        box["calls"] += 1
        box.update(kwargs)
        return _FakeResp(box.get("_reply", '{"ok": true}'))
    return create


# ── Handoff is wired into every endpoint and short-circuits the LLM ──────────

def test_pathway_handoff_short_circuits_llm(client, monkeypatch):
    box = {"calls": 0}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    r = client.post("/api/pathway", json={"intake": "I overstayed my visa and now have a deportation order."})
    d = r.get_json()
    assert r.status_code == 200 and d["handoff"] is True
    assert d["primaryPathway"] == "Needs licensed attorney review"
    assert box["calls"] == 0  # never paid for an LLM call


def test_stage_qa_handoff(client, monkeypatch):
    box = {"calls": 0}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    d = client.post("/api/stage-qa", json={
        "question": "I was convicted of a felony, can I still get a green card?"}).get_json()
    assert d["handoff"] is True and d["answer"] == HANDOFF_MESSAGE
    assert box["calls"] == 0


def test_document_review_handoff(client, monkeypatch):
    box = {"calls": 0}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    d = client.post("/api/document-review", json={
        "document": "I submitted false documents with my last application."}).get_json()
    assert d["handoff"] is True and d["overallStatus"] == "needs-attention"
    assert box["calls"] == 0


def test_chat_handoff(client, monkeypatch):
    box = {"calls": 0}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    d = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "I entered without inspection and have no papers."}]}).get_json()
    assert d["handoff"] is True
    assert d["choices"][0]["message"]["content"] == HANDOFF_MESSAGE
    assert box["calls"] == 0


def test_interview_handoff(client, monkeypatch):
    box = {"calls": 0}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    d = client.post("/api/interview", json={
        "pathway": "Family-based", "answer": "I was arrested for a DUI last year."}).get_json()
    assert d["handoff"] is True and d["done"] is True
    assert box["calls"] == 0


# ── Benign text still reaches the LLM (no over-blocking) ─────────────────────

def test_benign_chat_reaches_llm(client, monkeypatch):
    box = {"calls": 0, "_reply": "It usually takes several months."}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    d = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "How long does the I-485 take to process?"}]}).get_json()
    assert d.get("handoff") is not True
    assert d["choices"][0]["message"]["content"] == "It usually takes several months."
    assert box["calls"] == 1


def test_chat_notice_extract_schema_is_exempt(client, monkeypatch):
    # OCR date-extraction transforms a document the user already holds; it must
    # not be blocked even if the scanned notice text mentions "deportation".
    box = {"calls": 0, "_reply": '{"dates": []}'}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    d = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "Notice of deportation hearing on 2026-08-01"}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "notice_extract"}},
    }).get_json()
    assert d.get("handoff") is not True and box["calls"] == 1


# ── Same-origin guard ────────────────────────────────────────────────────────

def test_cross_origin_request_blocked(client):
    r = client.post("/api/chat",
                    json={"messages": [{"role": "user", "content": "hi"}]},
                    headers={"Origin": "http://evil.example.com"})
    assert r.status_code == 403


def test_same_host_origin_allowed(client, monkeypatch):
    box = {"calls": 0, "_reply": "hello"}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    r = client.post("/api/chat",
                    json={"messages": [{"role": "user", "content": "How do I file I-130?"}]},
                    headers={"Origin": "http://localhost"})
    assert r.status_code == 200


# ── Rate limiter ─────────────────────────────────────────────────────────────

def test_rate_limit_returns_429_past_cap(monkeypatch):
    server.app.config["TESTING"] = True
    server.app.config["ENFORCE_RATE_LIMIT"] = True
    server._rate_hits.clear()
    box = {"calls": 0, "_reply": "ok"}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create_counter(box))
    c = server.app.test_client()
    try:
        statuses = []
        for _ in range(server.RATE_LIMIT_MAX + 1):
            statuses.append(c.post("/api/chat", json={
                "messages": [{"role": "user", "content": "How long does the I-485 take?"}]}).status_code)
        assert statuses[:server.RATE_LIMIT_MAX] == [200] * server.RATE_LIMIT_MAX
        assert statuses[server.RATE_LIMIT_MAX] == 429
    finally:
        server.app.config["ENFORCE_RATE_LIMIT"] = False
        server._rate_hits.clear()
