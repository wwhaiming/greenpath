"""Golden / contract tests for the GreenPath backend.

These pin the DETERMINISTIC surfaces — the Visa Bulletin wait math, request
validation, and response shaping — so behavior is proven, not assumed. The LLM
itself is non-deterministic, so its calls are mocked: we assert that the server
wires inputs/outputs correctly (model honored, grounding kept, JSON extracted),
not what the model says. No network is required to run these.

    .venv/bin/python -m pytest tests/ -q
"""
import pytest

import server
from visa_data import project_current, build_brief


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


# ── Deterministic dataset logic ──────────────────────────────────────────────

def test_project_current_already_current():
    # Mexico EB3 priority date 2020-06-01 is on/before the latest action date.
    r = project_current("Mexico", "EB3", "2020-06-01")
    assert r and r["years"] == 0.0


def test_project_current_stalled_has_no_forecast():
    # India EB2 has a non-positive recent slope → no reliable forecast.
    r = project_current("India", "EB2", "2015-01-01")
    assert r and r["years"] is None


def test_project_current_unknown_country_returns_none():
    assert project_current("Atlantis", "EB2", "2015-01-01") is None


def test_build_brief_nonempty_and_bounded():
    b = build_brief()
    assert b and "VISA BULLETIN" in b and len(b) <= 2600


# ── Pure mapping / parsing helpers ───────────────────────────────────────────

def test_ve_country_mapping():
    assert server._ve_country("China (mainland-born)") == "China"
    assert server._ve_country("India") == "India"
    assert server._ve_country("All other countries (Worldwide)") == "Rest of world"


def test_ve_eb_mapping():
    assert server._ve_eb("EB-2 (advanced degree / exceptional ability)") == "EB2"
    assert server._ve_eb("EB-3 Other Workers (unskilled)") == "EB3"
    assert server._ve_eb("F1 (unmarried adult sons/daughters of U.S. citizens)") is None


def test_extract_json_handles_fences_and_prose():
    assert server._extract_json("```json\n{\"a\": 1}\n```") == {"a": 1}
    assert server._extract_json("here you go: {\"a\": 2} thanks") == {"a": 2}


# ── /api/visa-estimate — deterministic, no LLM ───────────────────────────────

def test_visa_estimate_employment_current(client):
    r = client.post("/api/visa-estimate", json={
        "category": "EB-3 (skilled workers and professionals)",
        "country": "Mexico", "priority_date": "2020-06-01"})
    d = r.get_json()
    assert r.status_code == 200 and d["available"] is True and d["years"] == 0.0
    assert d["category"] == "EB3" and d["country"] == "Mexico"


def test_visa_estimate_family_is_unavailable(client):
    r = client.post("/api/visa-estimate", json={
        "category": "F1 (unmarried adult sons/daughters of U.S. citizens)",
        "country": "India", "priority_date": "2018-01-01"})
    assert r.get_json()["available"] is False


def test_visa_estimate_bad_body_is_400(client):
    r = client.post("/api/visa-estimate", data="not json",
                    content_type="application/json")
    assert r.status_code == 400


# ── Request validation (returns before any LLM call) ─────────────────────────

def test_chat_bad_body_is_400(client):
    assert client.post("/api/chat", data="x",
                       content_type="application/json").status_code == 400


def test_chat_bad_max_tokens_is_400(client):
    assert client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": "abc"}).status_code == 400


def test_chat_empty_messages_is_400(client):
    assert client.post("/api/chat", json={"messages": []}).status_code == 400


def test_pathway_missing_intake_is_400(client):
    assert client.post("/api/pathway", json={}).status_code == 400


def test_missing_asset_is_404(client):
    assert client.get("/definitely-missing.js").status_code == 404


# ── Response shaping with a mocked LLM ───────────────────────────────────────

class _FakeResp:
    def __init__(self, content):
        msg = type("M", (), {"content": content})
        self.choices = [type("C", (), {"message": msg})]


def _mock_create(captured):
    def create(**kwargs):
        captured.update(kwargs)
        return _FakeResp(captured.get("_reply", '{"ok": true}'))
    return create


def test_chat_dual_shape_model_and_grounding(client, monkeypatch):
    cap = {"_reply": "hello world"}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create(cap))
    r = client.post("/api/chat", json={
        "model": "gpt-4o",
        "messages": [
            {"role": "system", "content": "GROUND RULES: cite sources"},
            {"role": "user", "content": "hi"},
        ]})
    d = r.get_json()
    # Dual response shape (both frontends).
    assert d["choices"][0]["message"]["content"] == "hello world"
    assert d["content"][0]["text"] == "hello world"
    # Requested allowlisted model is honored.
    assert d["model"] == "gpt-4o" and cap["model"] == "gpt-4o"
    # Guardrail is first; the caller's grounding system prompt is preserved.
    sent = cap["messages"]
    assert sent[0]["role"] == "system"
    assert any("GROUND RULES" in m["content"] for m in sent)


def test_chat_non_allowlisted_model_falls_back(client, monkeypatch):
    cap = {"_reply": "x"}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create(cap))
    client.post("/api/chat", json={
        "model": "totally-made-up", "messages": [{"role": "user", "content": "hi"}]})
    assert cap["model"] == "gpt-4o-mini"


def test_pathway_extracts_json_from_model(client, monkeypatch):
    cap = {"_reply": "```json\n{\"primaryPathway\": \"Family-based\", \"confidence\": \"high\"}\n```"}
    monkeypatch.setattr(server.client.chat.completions, "create", _mock_create(cap))
    d = client.post("/api/pathway", json={"intake": "married to a US citizen"}).get_json()
    assert d["primaryPathway"] == "Family-based" and d["confidence"] == "high"
