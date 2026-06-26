"""Privacy tests: PII redaction, no-retention notice, request-size audit.

    .venv/bin/python -m pytest tests/test_privacy.py -q
"""
import pytest

import privacy
import server


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


# ── Redaction ────────────────────────────────────────────────────────────────

def test_redact_email_phone_ssn():
    s = "contact me at jane.doe@example.com or 415-555-1234, SSN 123-45-6789"
    out = privacy.redact(s)
    assert "jane.doe@example.com" not in out
    assert "415-555-1234" not in out
    assert "123-45-6789" not in out
    assert "[redacted-email]" in out and "[redacted-phone]" in out and "[redacted-ssn]" in out


def test_redact_a_number_and_receipt():
    out = privacy.redact("My A-number is A123456789 and receipt IOE1234567890.")
    assert "A123456789" not in out and "[redacted-anumber]" in out
    assert "IOE1234567890" not in out and "[redacted-receipt]" in out


def test_redact_passes_through_clean_and_nonstring():
    assert privacy.redact("how long does I-485 take?") == "how long does I-485 take?"
    assert privacy.redact(None) is None
    assert privacy.redact(123) == 123


def test_redact_is_bounded():
    big = "a" * 5000
    assert len(privacy.redact(big)) < 5000


# ── Notice + audit ───────────────────────────────────────────────────────────

def test_privacy_notice_states_no_retention():
    n = privacy.privacy_notice()
    text = " ".join(n["guarantees"].values()).lower()
    assert "does not store" in text
    assert "redaction" in text or "redact" in text
    assert "browser" in text  # local browser-only OCR/translation
    assert "email" in n["redacts"] and "ssn" in n["redacts"]


def test_audit_request_size_has_no_body():
    a = privacy.audit_request_size("/api/chat", 999999, 262144)
    assert a["over_limit"] is True and "content_length" in a
    assert "body" not in a and "text" not in a


# ── Endpoint ─────────────────────────────────────────────────────────────────

def test_privacy_endpoint(client):
    d = client.get("/api/privacy").get_json()
    assert "guarantees" in d and "no_retention" in d["guarantees"]
    assert "local_only_mode_active" in d
