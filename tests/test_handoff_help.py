"""Post-handoff help tests (gaps: thin post-handoff help + over-refusal).

Proves that a conservative attorney handoff still leaves the user with safe,
non-advice next steps: crisis urgency, what to ask an attorney, what documents to
gather, official resources, and location-aware legal-aid referrals.

    .venv/bin/python -m pytest tests/test_handoff_help.py -q
"""
import pytest

import server
import handoff
from handoff import detect_handoff, build_handoff_response, safe_prep


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


# ── safe_prep attached to every handoff response ─────────────────────────────

def test_urgency_labels():
    assert handoff.urgency_for("removal_proceedings") == "urgent"
    assert handoff.urgency_for("asylum_one_year_deadline") == "urgent"
    assert handoff.urgency_for("criminal_history") == "high"


def test_safe_prep_has_questions_docs_resources():
    hand = detect_handoff("I have a removal proceeding and a notice to appear.")
    prep = safe_prep(hand)
    assert prep["urgency"] == "urgent"
    assert len(prep["questions_for_attorney"]) >= 3 and prep["documents_to_gather"]
    assert any("eligible" in q.lower() for q in prep["questions_for_attorney"])
    # Category-specific document appears (NTA for removal).
    assert any("Notice to Appear" in d or "NTA" in d for d in prep["documents_to_gather"])
    assert all(r["url"].startswith("http") for r in prep["official_resources"])


def test_build_handoff_response_carries_safe_prep():
    hand = detect_handoff("I was convicted of a felony.")
    for kind in ("chat", "stage-qa", "pathway", "document-review", "interview"):
        r = build_handoff_response(kind, hand)
        assert r["urgency"] in ("urgent", "high")
        assert r["safe_prep"]["questions_for_attorney"]
        assert r["safe_prep"]["documents_to_gather"]


# ── /api/handoff-help endpoint ───────────────────────────────────────────────

def test_handoff_help_with_text_and_state(client):
    d = client.post("/api/handoff-help", json={
        "text": "I have a deportation order and a hearing in immigration court.",
        "state": "NY"}).get_json()
    assert d["handoff"] is True and d["urgency"] == "urgent"
    assert d["questions_for_attorney"] and d["documents_to_gather"]
    assert d["official_resources"]
    assert d["legal_aid_providers"], "expected NY legal-aid referrals"
    assert all(p["state"] == "NY" for p in d["legal_aid_providers"])
    assert "not legal advice" in d["disclaimer"].lower()


def test_handoff_help_with_zip(client):
    d = client.post("/api/handoff-help", json={
        "category": "criminal_history", "zip": "90001"}).get_json()
    assert d["handoff"] is True
    assert all(p["state"] == "CA" for p in d["legal_aid_providers"])


def test_handoff_help_requires_input(client):
    assert client.post("/api/handoff-help", json={}).status_code == 400


def test_handoff_help_no_location_still_gives_prep(client):
    d = client.post("/api/handoff-help", json={
        "text": "I want to apply for asylum because I fear persecution."}).get_json()
    assert d["urgency"] == "urgent"
    assert d["legal_aid_providers"] == []   # no location given
    assert d["questions_for_attorney"]      # but prep is still provided
