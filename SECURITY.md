# Security

## SECURITY_ROTATION_REQUIRED (action needed by the repo owner)

An OpenAI API key (prefix `sk-proj-jA6...`) was committed to this repository's
git **history** and must be treated as **compromised**. It needs to be rotated.

### Evidence
The key is present in historical commits, not just the working tree:

- `a712a9a` — "Add .env with OpenAI API key so AI features work out of the box"
- `8842acd` — "Embed OpenAI key in standalone build so AI works opened directly"
  (key embedded in `index-standalone.html`)
- `50dfdbb`, `7fd4c52` — key still present in `.env` and `index-standalone.html` blobs
- `5ffa9b5` — "remove embedded API key"
- `f8445ad` — "Remove .env file with secrets" (removed from HEAD only)

Removing the file in a later commit does **not** remove the secret from history.
Anyone who has cloned, forked, or fetched this repository (it was pushed to a
public GitHub remote) can recover the key from history.

### Required remediation (only the key owner can do these)
1. **Rotate the key now**: revoke `sk-proj-jA6...` in the OpenAI dashboard
   (https://platform.openai.com/api-keys) and issue a new one.
2. Put the new key only in a local, untracked `.env` (see `.env.example`). On
   Render, set it as an environment variable in the dashboard — never in code.
3. **Purge it from history** with `git filter-repo` (or BFG), then force-push,
   and ask any collaborators to re-clone. Until history is purged, assume the
   old key is public.

> This document does NOT claim the key has been rotated. Rotation requires
> access to the OpenAI account and cannot be verified from this repository.
> Treat the old key as live and exposed until you have rotated it yourself.

### Observation (not a rotation claim)
As tested on 2026-06-26, a live request using the committed key returned
`HTTP 401 invalid_api_key` from OpenAI, which suggests this specific key may
already be revoked. This is only an observed API response — it does not confirm
that you rotated it, and it does not remove the key from git history. Still
complete the remediation above (issue a fresh key for the deployment and purge
history). Note: until a valid `OPENAI_API_KEY` is set, the live AI features
return a server error; the deterministic features (visa estimate, attorney
handoff, static site) work without any key.

## Current state of the working tree (verified)
- No API key is hardcoded in `server.py`, `public/index.html`, or any tracked
  source file. The server reads `OPENAI_API_KEY` via `os.environ`.
- `.env` is listed in `.gitignore` and is not tracked.
- The browser never receives the key: all model calls go through the server-side
  proxy in `server.py`.

## Backend protections
- **Attorney-handoff hard stop** (`handoff.py`): deterministic, server-side
  detection of high-risk situations (removal/deportation, criminal history,
  fraud, asylum deadlines, VAWA/U/T visas, inadmissibility bars, prior denials,
  unauthorized work, overstay, no legal status). When triggered, the server
  returns a "see a licensed attorney" message and never calls the LLM. Wired
  into `/api/chat`, `/api/pathway`, `/api/stage-qa`, `/api/document-review`,
  `/api/interview`.
- **Rate limiting + same-origin guard** on billable LLM routes
  (`_guard_llm_routes` in `server.py`): cross-site browser requests get `403`,
  and requests over `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW` per client IP get
  `429`. Limitation: the limiter is in-process, so with multiple gunicorn
  workers the effective ceiling is per-worker; move to Redis for production.
- **Input validation + size caps**: `MAX_CONTENT_LENGTH`, per-field char limits,
  message/transcript caps, and a model allowlist (`ALLOWED_CHAT_MODELS`).

## Reporting
This is a student hackathon project, not a production legal service. It does not
provide legal advice. For a real vulnerability, open a private issue or contact
the repository owner.
