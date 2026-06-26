"""Contract tests for /api/legal-aid — the deterministic legal-aid lookup.

These prove the real-data behavior without any network or LLM: filtering by
state and by ZIP, input validation (400s), the source + retrieved_at metadata,
the 25-result cap, and graceful degradation when the dataset is missing.

    .venv/bin/python -m pytest tests/test_legal_aid.py -q
"""
import json

import pytest

import server


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


# ── Pure helper: ZIP -> state ────────────────────────────────────────────────

def test_zip_to_state_known_prefixes():
    assert server._zip_to_state("10001") == "NY"   # New York City
    assert server._zip_to_state("90001") == "CA"   # Los Angeles
    assert server._zip_to_state("77001") == "TX"   # Houston
    assert server._zip_to_state("98101") == "WA"   # Seattle
    assert server._zip_to_state("60601") == "IL"   # Chicago
    assert server._zip_to_state("33101") == "FL"   # Miami


def test_zip_to_state_unassigned_is_none():
    assert server._zip_to_state("00000") is None


# ── Filtering by state ───────────────────────────────────────────────────────

def test_filter_by_state_returns_only_that_state(client):
    r = client.get("/api/legal-aid?state=NY")
    assert r.status_code == 200
    d = r.get_json()
    assert d["count"] >= 1
    assert all(p["state"] == "NY" for p in d["providers"])
    # Each provider carries the documented contract fields.
    p = d["providers"][0]
    for key in ("name", "city", "state", "phone", "url"):
        assert key in p


def test_state_filter_is_case_insensitive(client):
    assert client.get("/api/legal-aid?state=ny").status_code == 200
    assert client.get("/api/legal-aid?state=ny").get_json()["count"] >= 1


def test_includes_source_and_retrieved_at(client):
    d = client.get("/api/legal-aid?state=CA").get_json()
    assert d["source"] and isinstance(d["source"], str)
    assert d["retrieved_at"]                     # non-empty freshness date
    assert d["source_url"].startswith("http")
    assert "endorsement" in d["note"].lower()    # informational, not endorsement


# ── Filtering by ZIP (maps to state) ─────────────────────────────────────────

def test_filter_by_zip_maps_to_state(client):
    d = client.get("/api/legal-aid?zip=10001").get_json()
    assert d["count"] >= 1
    assert all(p["state"] == "NY" for p in d["providers"])
    assert d["query"]["resolved_states"] == ["NY"]


def test_post_body_works(client):
    r = client.post("/api/legal-aid", json={"state": "TX"})
    assert r.status_code == 200
    assert all(p["state"] == "TX" for p in r.get_json()["providers"])


# ── Result cap ───────────────────────────────────────────────────────────────

def test_results_capped_at_max(client):
    d = client.get("/api/legal-aid?state=NY").get_json()
    assert len(d["providers"]) <= server._LEGAL_AID_MAX
    assert d["max_results"] == server._LEGAL_AID_MAX


# ── Input validation → 400 ───────────────────────────────────────────────────

def test_no_filter_is_400(client):
    assert client.get("/api/legal-aid").status_code == 400


def test_bad_state_is_400(client):
    assert client.get("/api/legal-aid?state=ZZ").status_code == 400
    assert client.get("/api/legal-aid?state=California").status_code == 400


def test_bad_zip_is_400(client):
    assert client.get("/api/legal-aid?zip=abcde").status_code == 400
    assert client.get("/api/legal-aid?zip=123").status_code == 400


def test_post_bad_json_is_400(client):
    r = client.post("/api/legal-aid", data="[1,2,3]",
                    content_type="application/json")
    assert r.status_code == 400


# ── No matches → 200 with a helpful message ──────────────────────────────────

def test_unmatched_state_returns_empty_with_message(client):
    # Wyoming is a valid state with no dataset coverage.
    d = client.get("/api/legal-aid?state=WY").get_json()
    assert d["count"] == 0
    assert "immigrationlawhelp.org" in d["message"].lower()
    assert d["source"]  # source/metadata still present


# ── Graceful degrade when the dataset is missing ─────────────────────────────

def test_missing_dataset_degrades_gracefully(client, monkeypatch):
    monkeypatch.setattr(server, "_LEGAL_AID_PATH", "/nonexistent/legal_aid.json")
    r = client.get("/api/legal-aid?state=NY")
    assert r.status_code == 200            # does not crash
    d = r.get_json()
    assert d["providers"] == []
    assert d["source_url"] == server._LEGAL_AID_FALLBACK_URL
    assert "immigrationlawhelp.org" in d["message"].lower()


def test_empty_dataset_degrades_gracefully(client, monkeypatch, tmp_path):
    empty = tmp_path / "legal_aid.json"
    empty.write_text(json.dumps({"source": "x", "providers": []}), encoding="utf-8")
    monkeypatch.setattr(server, "_LEGAL_AID_PATH", str(empty))
    d = client.get("/api/legal-aid?state=NY").get_json()
    assert d["providers"] == []
    assert "immigrationlawhelp.org" in d["message"].lower()
