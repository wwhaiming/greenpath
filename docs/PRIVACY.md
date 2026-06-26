# Privacy

GreenPath users enter some of the most sensitive data that exists: immigration
status, criminal history, abuse/trafficking history, and family details. The
privacy posture is enforced in code (`privacy.py`) and surfaced at
`GET /api/privacy`, not just promised here.

## No retention

GreenPath does **not** store the text you enter. Requests are processed in memory
to generate a response and then discarded. There is no server-side database of
your situation, documents, or chat history, and no user accounts.

## No PII in logs (redaction before logging)

The server logs only request **metadata** (route, status, sizes, timing). Any
string that is ever logged is first run through `privacy.redact`, which masks:

- email addresses
- phone numbers
- SSNs (`123-45-6789`)
- USCIS A-numbers (`A123456789`)
- USCIS receipt numbers (`IOE1234567890`)
- long digit sequences (passport/case numbers)

User request bodies are never written to logs.

## Browser-local features (data never leaves your device)

Document scanning (OCR via tesseract.js), PDF reading (pdf.js), translation, and
read-aloud (Web Speech API) run entirely in your browser. The image/PDF bytes
never reach the server. Only the plain text you explicitly submit to an AI
feature is sent, and only for that single request.

### Optional local-only mode

Set `GREENPATH_LOCAL_ONLY=1` (or use the browser local-only toggle) to keep
document/OCR features fully on-device and disable server AI calls entirely; the
deterministic features (visa estimate, legal-aid lookup, handoff safety check)
still work.

## Request-size audit

Bodies are capped at 256 KB (`MAX_CONTENT_LENGTH`). Requests approaching the cap
emit a redaction-safe audit line containing only sizes — never the body
(`privacy.audit_request_size`).

## What we do not do

GreenPath is not a law firm and does not sell or share your information. AI
features call the model provider solely to generate your answer.

## Your control

Prefer the deterministic features when you can — they need no AI call at all.
Avoid entering full names, A-numbers, or SSNs you do not need to share.
