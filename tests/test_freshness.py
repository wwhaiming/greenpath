"""Freshness gate + reporting tests.

The headline test is the automated tripwire the spec asks for: every GATED
dataset must satisfy ``days_since(retrieved_at) <= max_age_days``. It passes now
(the curated corpus + legal-aid directory were verified today) and will FAIL once
they age out, forcing a re-pull before stale policy/fees/forms can ship.

    .venv/bin/python -m pytest tests/test_freshness.py -q
"""
from datetime import date, timedelta

import freshness
import server


def test_report_has_expected_datasets():
    keys = {d["key"] for d in freshness.report()["datasets"]}
    assert {"uscis_sources", "legal_aid", "visa_bulletin"} <= keys


def test_gated_datasets_are_within_threshold():
    """THE freshness gate: no gated dataset may exceed its max age."""
    for d in freshness.report()["datasets"]:
        if d["gate"]:
            assert d["days_old"] is not None, f"{d['key']} has no retrieved_at date"
            assert d["days_old"] <= d["max_age_days"], (
                f"STALE: {d['key']} is {d['days_old']}d old "
                f"(max {d['max_age_days']}d) — re-pull the dataset")
            assert d["stale"] is False


def test_no_gated_dataset_is_stale_rollup():
    assert freshness.report()["any_gate_stale"] is False


def test_visa_bulletin_staleness_is_surfaced_not_hidden():
    # The Visa Bulletin lag is reported honestly (content_period, ungated) rather
    # than concealed; the server's own staleness flag agrees.
    visa = next(d for d in freshness.report()["datasets"] if d["key"] == "visa_bulletin")
    assert visa["gate"] is False
    assert visa["stale"] is server._visa_data_stale()


def test_stale_detection_fires_for_old_data():
    """Inject a far-future 'today' so the gated datasets read as stale."""
    future = date.today() + timedelta(days=400)
    rep = freshness.report(today=future)
    assert rep["any_gate_stale"] is True
    assert all(d["stale"] for d in rep["datasets"] if d["gate"])


def test_health_exposes_freshness(client_app):
    d = client_app.get("/api/health").get_json()
    assert "data_fresh" in d and d["data_fresh"] is True
    assert d["visa_data_stale"] is server._visa_data_stale()


def test_freshness_endpoint(client_app):
    d = client_app.get("/api/freshness").get_json()
    assert d["as_of"] and isinstance(d["datasets"], list)
    assert d["any_gate_stale"] is False


import pytest


@pytest.fixture
def client_app():
    server.app.config["TESTING"] = True
    return server.app.test_client()
