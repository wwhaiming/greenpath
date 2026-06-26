"""Production-profile tests (gap: hackathon-grade architecture).

Covers the always-on security headers, env validation at boot, the Redis/in-memory
rate-limiter selection, and opt-in HTTPS enforcement.

    .venv/bin/python -m pytest tests/test_prod.py -q
"""
import pytest

import server


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    return server.app.test_client()


# ── Security headers ─────────────────────────────────────────────────────────

def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    csp = r.headers.get("Content-Security-Policy")
    assert csp and "frame-ancestors 'none'" in csp and "default-src 'self'" in csp
    # The single-file frontend depends on these origins for fonts, OCR/PDF, and
    # the keyless translation fallback; CSP must not silently break those flows.
    for origin in (
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com",
        "https://translate.googleapis.com",
    ):
        assert origin in csp


def test_no_hsts_without_force_https(client):
    # HSTS only when HTTPS is enforced.
    assert "Strict-Transport-Security" not in client.get("/api/health").headers


# ── Env validation ───────────────────────────────────────────────────────────

def test_validate_env_returns_warnings_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GREENPATH_DEMO", raising=False)
    monkeypatch.setattr(server, "REDIS_URL", "")
    monkeypatch.setattr(server, "FORCE_HTTPS", False)
    warnings = server.validate_env()
    assert any("OPENAI_API_KEY" in w for w in warnings)


def test_validate_env_warns_on_unreachable_redis(monkeypatch):
    monkeypatch.setattr(server, "REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(server, "_redis_client", None)
    monkeypatch.setattr(server, "_redis_status", "redis-unreachable (in-memory fallback)")
    monkeypatch.setattr(server, "FORCE_HTTPS", False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert any("in-memory limiter" in w for w in server.validate_env())


def test_validate_env_raises_in_hardened_profile(monkeypatch):
    monkeypatch.setattr(server, "REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(server, "_redis_client", None)
    monkeypatch.setattr(server, "FORCE_HTTPS", True)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    with pytest.raises(RuntimeError):
        server.validate_env()


# ── Rate-limiter selection ───────────────────────────────────────────────────

def test_health_reports_rate_limiter(client):
    # No REDIS_URL in test env → in-memory.
    assert client.get("/api/health").get_json()["rate_limiter"] == "in-memory"


# ── HTTPS enforcement (opt-in) ───────────────────────────────────────────────

def test_https_redirect_when_forced(client, monkeypatch):
    monkeypatch.setattr(server, "FORCE_HTTPS", True)
    r = client.get("/api/health", headers={"X-Forwarded-Proto": "http"},
                   base_url="http://greenpath.example.com")
    assert r.status_code == 301
    assert r.headers["Location"].startswith("https://")


def test_https_ok_when_already_secure(client, monkeypatch):
    monkeypatch.setattr(server, "FORCE_HTTPS", True)
    r = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
    assert r.status_code == 200
    assert "Strict-Transport-Security" in r.headers
