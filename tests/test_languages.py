"""Internationalization matrix tests (gap: unproven 'any language' claim).

Validates the tested language matrix and, crucially, VERIFIES the claims it makes
about deterministic handoff detection: every language marked 'supported' must
actually trigger the attorney-handoff stop on a known high-risk phrase. This
keeps the matrix honest instead of aspirational.

    .venv/bin/python -m pytest tests/test_languages.py -q
"""
import json
import os

import pytest

import server
from handoff import detect_handoff

_MATRIX = json.load(open(os.path.join(os.path.dirname(__file__), "..",
                                       "datasets", "language_matrix.json")))
_REQUIRED = {"Spanish", "Chinese (Simplified)", "Arabic", "Hindi", "French",
             "Haitian Creole", "Russian", "Vietnamese"}

# Known high-risk phrases for languages claimed as handoff-'supported'.
_SUPPORTED_HIGH_RISK = {
    "English": "I have a deportation order.",
    "Spanish": "Tengo una orden de deportación.",
    "Chinese (Simplified)": "我被驱逐出境了。",
}


def test_matrix_covers_required_languages():
    names = {l["name"] for l in _MATRIX["languages"]}
    assert _REQUIRED <= names


def test_every_language_has_full_status_fields():
    for l in _MATRIX["languages"]:
        for field in ("code", "script", "tesseract", "ocr", "read_aloud",
                      "translation", "handoff_detection"):
            assert l.get(field), f"{l.get('name')} missing {field}"
        assert l["handoff_detection"] in ("supported", "english-fallback")
        assert l["read_aloud"].startswith("device-dependent")  # honest, not "guaranteed"


def test_handoff_supported_languages_actually_trigger():
    """The matrix's 'supported' handoff claim is backed by real detection."""
    for l in _MATRIX["languages"]:
        if l["handoff_detection"] == "supported":
            phrase = _SUPPORTED_HIGH_RISK.get(l["name"])
            assert phrase, f"no test phrase for supported language {l['name']}"
            assert detect_handoff(phrase)["handoff"] is True, l["name"]


def test_endpoint_serves_matrix():
    server.app.config["TESTING"] = True
    d = server.app.test_client().get("/api/languages").get_json()
    assert len(d["languages"]) >= len(_REQUIRED)
    assert "notes" in d and "handoff_detection" in d["notes"]
