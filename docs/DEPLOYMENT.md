# Production Deployment Profile

GreenPath ships as a single Flask app (`server.py`) that serves `public/` plus
the `/api/*` routes. The hackathon defaults are simple; production hardening is
opt-in via environment variables so nothing changes for local dev or tests.

## Environment variables

| Var | Effect | Default |
|---|---|---|
| `OPENAI_API_KEY` | enables live AI; absent → 503 (or demo) | unset |
| `GREENPATH_DEMO` | seeded, source-backed offline AI responses | off |
| `GREENPATH_LOCAL_ONLY` | disable server AI; keep OCR/translate on-device | off |
| `FORCE_HTTPS` | redirect http→https (via `X-Forwarded-Proto`) + HSTS | off |
| `REDIS_URL` | durable, cross-worker rate limiter | unset (in-memory) |
| `LOG_LEVEL` | structured-log verbosity | INFO |
| `PORT` / `FLASK_DEBUG` | bind port / debug | 5000 / false |

Configuration is validated at boot by `validate_env()` (called at import). It
logs warnings for a missing key or a configured-but-unreachable Redis, and
**raises** in a hardened profile (`FORCE_HTTPS=1` + `REDIS_URL` set) if Redis is
unreachable — fail fast rather than silently degrade.

## Rate limiting: Redis vs in-memory

The billable LLM routes are rate-limited per client IP. With `REDIS_URL` set and
the `redis` package installed and reachable, the limiter uses a shared fixed-
window counter that is correct across multiple gunicorn workers and hosts. Add to
`requirements.txt` for production:

```
redis>=5.0
```

Without Redis it falls back to the existing in-process sliding window (per-worker
ceiling, resets on redeploy). The limiter **fails open** on a Redis error (logs
the blip, allows the request) so a Redis hiccup never takes the app down.
`/api/health.rate_limiter` reports which backend is active.

## Security headers (always on)

Set on every response by `_security_headers`:
`Content-Security-Policy` (permits the in-browser OCR/PDF CDNs + inline styles
the single-file frontend needs, blocks framing), `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and — when `FORCE_HTTPS`
is on — `Strict-Transport-Security`.

## Structured logging + redaction

`_slog(event, **fields)` emits one JSON line per event with every string field
run through `privacy.redact` (emails, phones, SSNs, A-numbers, receipt numbers).
User request **bodies are never logged**; only metadata (route, sizes, status).
A request-size audit line is emitted when a body approaches `MAX_CONTENT_LENGTH`.

## Recommended Render config

`render.yaml` already runs gunicorn with 2 workers. For production add the env
vars above (`FORCE_HTTPS=1`, `REDIS_URL`, a rotated `OPENAI_API_KEY`) in the
Render dashboard, and a managed Redis instance.

## Known production TODOs (honest)

- Add `redis>=5.0` to `requirements.txt` and provision Redis to activate the
  durable limiter (code path is complete; package is intentionally not a default
  dependency).
- Durable audit log sink (currently stdout structured logs; ship to a log store).
- User-account security model is out of scope: GreenPath stores no accounts and
  no user data (see `docs/PRIVACY.md`).
