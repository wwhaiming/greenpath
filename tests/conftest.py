"""Shared pytest setup for the GreenPath suite.

The LLM-route tests mock ``client.chat.completions.create`` and only need the
route's key-gate to pass. We pin a non-secret placeholder key here so the suite
NEVER depends on a real (or previously committed) key sitting in ``.env`` — the
working-tree key was sanitized for security. No network call is ever made: every
test either hits a deterministic path or a mocked client.
"""
import server

# Only set a placeholder when no real key is configured, so a developer with a
# live key in .env still exercises the real client construction path.
if not server.OPENAI_API_KEY:
    server.OPENAI_API_KEY = "sk-test-placeholder-not-a-real-key"
