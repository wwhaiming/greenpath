"""Privacy primitives for GreenPath (deterministic, no network, no LLM).

GreenPath users type some of the most sensitive data that exists: immigration
status, criminal history, abuse/trafficking history, and family details. Three
concrete protections live here:

  1. ``redact(text)`` — scrubs the obvious direct identifiers (emails, phone
     numbers, SSNs, A-numbers, USCIS receipt numbers, long digit runs) from any
     string BEFORE it could reach a log line. The server logs only metadata, not
     user content, but redaction is applied defensively to anything that is
     logged so a stack trace or audit line can never leak PII.

  2. ``PRIVACY_NOTICE`` / ``privacy_notice()`` — the machine-readable
     no-retention statement served at ``/api/privacy`` and rendered in the UI.

  3. ``audit_request_size(...)`` — a redaction-safe structured record of an
     oversized request (no body, just sizes) for the request-size audit.

No user-submitted text is persisted by GreenPath: requests are processed in
memory and discarded when the response is returned. This module exists so that
guarantee is enforced in code and is testable, not just claimed in a README.
"""
import re

# Direct-identifier patterns. Order matters: more specific (A-number, receipt,
# SSN) before the generic long-digit fallback so they get their own label.
_REDACTIONS = [
    (re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"), "[redacted-email]"),
    # USCIS A-number: A followed by 8 or 9 digits (optionally spaced/hyphenated).
    (re.compile(r"\bA[#\-\s]?\d{3}[\-\s]?\d{3}[\-\s]?\d{2,3}\b", re.IGNORECASE), "[redacted-anumber]"),
    # USCIS receipt number: 3 letters + 10 digits (e.g. IOE1234567890, MSC...).
    (re.compile(r"\b[A-Za-z]{3}\d{10}\b"), "[redacted-receipt]"),
    # SSN.
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[redacted-ssn]"),
    # Phone (US-ish, with separators or parens).
    (re.compile(r"\b(?:\+?1[\-\s.]?)?\(?\d{3}\)?[\-\s.]\d{3}[\-\s.]\d{4}\b"), "[redacted-phone]"),
    # Generic long digit run (7+), e.g. passport / case numbers, last.
    (re.compile(r"\b\d{7,}\b"), "[redacted-number]"),
]

_MAX_REDACT_LEN = 2000


def redact(text):
    """Return ``text`` with direct identifiers masked. Non-strings pass through
    untouched (so it is safe to wrap arbitrary log args). Truncates very long
    inputs so a redacted log line stays bounded."""
    if not isinstance(text, str) or not text:
        return text
    s = text if len(text) <= _MAX_REDACT_LEN else text[:_MAX_REDACT_LEN] + "...[truncated]"
    for pattern, repl in _REDACTIONS:
        s = pattern.sub(repl, s)
    return s


# No-retention privacy notice. Kept as data so /api/privacy and the UI render the
# exact same statement, and a test can assert the guarantees are present.
PRIVACY_NOTICE = {
    "no_retention": (
        "GreenPath does not store the text you enter. Requests are processed in "
        "memory to generate a response and are then discarded. We do not keep a "
        "database of your situation, documents, or chat history on the server."),
    "no_pii_in_logs": (
        "Server logs record only request metadata (route, status, timing). Any "
        "text that is ever logged is run through automated redaction first, which "
        "masks emails, phone numbers, SSNs, A-numbers, and receipt numbers."),
    "browser_local_features": (
        "Document scanning (OCR), PDF reading, translation, and read-aloud run "
        "entirely in your browser. The image/PDF bytes never leave your device. "
        "Only the plain text you choose to submit to an AI feature is sent to the "
        "server, and only for that single request."),
    "no_third_party_sharing": (
        "GreenPath is not a law firm and does not sell or share your information. "
        "AI features call the model provider solely to generate your answer."),
    "your_control": (
        "You can use the deterministic features (visa-wait estimate, legal-aid "
        "lookup, attorney-handoff safety check) without any AI call at all. "
        "Avoid entering full names, A-numbers, or SSNs you do not need to share."),
    "local_only_mode": (
        "Set GREENPATH_LOCAL_ONLY=1 (or use the browser's local-only toggle) to "
        "keep document/OCR features fully on-device and disable server AI calls."),
}


def privacy_notice():
    """Return the privacy notice plus the list of identifier types redacted."""
    return {
        "guarantees": PRIVACY_NOTICE,
        "redacts": ["email", "phone", "ssn", "a-number", "uscis-receipt",
                    "long-digit-sequences"],
    }


def audit_request_size(route, content_length, limit):
    """Redaction-safe structured record for the request-size audit. Contains NO
    body, only sizes — safe to log verbatim."""
    return {
        "event": "request_size_audit",
        "route": route,
        "content_length": int(content_length or 0),
        "limit": int(limit),
        "over_limit": (content_length or 0) > limit,
    }
