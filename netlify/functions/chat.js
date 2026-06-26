// Server-side proxy to the OpenAI API.
// The API key lives here as an environment variable (OPENAI_API_KEY) and is
// NEVER sent to the browser. The client posts {model, messages, ...} to /api/chat.
//
// This function is a PUBLIC endpoint, so it is hardened against the usual abuse
// of an open AI proxy: origin spoofing, request flooding, cost-bombing via huge
// models/token limits, JSON-schema blowups, and upstream error leakage.

const ALLOWED = new Set(['gpt-4o-mini', 'gpt-4o']);
const DEFAULT_MODEL = 'gpt-4o-mini';
const ROLES = new Set(['system', 'user', 'assistant']);
const MAX_MESSAGES = 20;
const MAX_CONTENT_CHARS = 6000;
const MAX_TOTAL_CHARS = 18000;

// Token clamp bounds. Trusted callers get the full range; untrusted callers
// (no Origin/Referer) are capped harder in the cost-defense step below.
const MAX_TOKENS_MIN = 80;
const MAX_TOKENS_MAX = 1200;
const MAX_TOKENS_DEFAULT = 900;
const UNTRUSTED_MAX_TOKENS = 600;

// JSON-schema abuse guards: a forwarded json_schema may not be larger than this
// serialized, nor nested deeper than this. Over-limit schemas are ignored (we
// fall back to no response_format) rather than rejected with a 500.
const MAX_SCHEMA_CHARS = 4000;
const MAX_SCHEMA_DEPTH = 8;

// Best-effort rate limit: N requests per rolling window per client IP.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Best-effort, in-memory rate-limit store keyed by client IP.
// IMPORTANT: this is BEST-EFFORT only. Netlify function instances are ephemeral
// and stateless: each cold start gets a fresh Map, and concurrent invocations
// can land on different instances, so this Map is NOT a global counter. It
// throttles bursts hitting one warm instance but is trivially bypassed at scale.
// The production-grade fix is a durable shared store (Netlify Blobs/KV or
// Upstash Redis) doing an atomic increment-with-expiry per IP.
const rateBuckets = new Map();

function clampNumber(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) {
    return null;
  }

  let totalChars = 0;
  const normalized = [];
  for (const message of messages) {
    if (!message || !ROLES.has(message.role) || typeof message.content !== 'string') {
      return null;
    }

    const content = message.content.slice(0, MAX_CONTENT_CHARS);
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) return null;
    normalized.push({ role: message.role, content });
  }

  return normalized;
}

// Measure the maximum nesting depth of a JSON-compatible value. Used to reject
// pathologically deep json_schema payloads that could blow up validation cost.
function jsonDepth(value, seen) {
  if (value === null || typeof value !== 'object') return 0;
  // Guard against cyclic references (shouldn't happen post-JSON.parse, but the
  // value originates from untrusted input, so be defensive).
  seen = seen || new Set();
  if (seen.has(value)) return Infinity;
  seen.add(value);

  let max = 0;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const d = jsonDepth(child, seen);
    if (d > max) max = d;
  }
  seen.delete(value);
  return max + 1;
}

// Parse the host out of an Origin/Referer URL. Returns null on anything unparseable.
function originHost(urlString) {
  if (!urlString || typeof urlString !== 'string') return null;
  try {
    return new URL(urlString).host.toLowerCase();
  } catch {
    return null;
  }
}

// Decide whether a request origin host is allowed.
// Allowed if: it matches the function's own host (same-site), it is a localhost
// loopback (any port, http) for local dev, or it appears in ALLOWED_ORIGINS.
function isOriginAllowed(reqHost, selfHost, allowSet) {
  if (!reqHost) return false;
  if (selfHost && reqHost === selfHost.toLowerCase()) return true;
  // localhost / 127.0.0.1 on any port -> URL.host strips default ports and
  // keeps explicit ones, so compare against the hostname portion.
  const hostname = reqHost.split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return allowSet.has(reqHost);
}

// Build the env-driven allowlist (comma-separated hosts/origins -> bare hosts).
function buildAllowSet() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const set = new Set();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // Accept either a full origin ("https://foo.com") or a bare host ("foo.com").
    const host = originHost(trimmed) || trimmed.toLowerCase();
    if (host) set.add(host);
  }
  return set;
}

// Header access is case-insensitive in HTTP, but Netlify lowercases header keys.
// This helper keeps lookups robust regardless.
function header(headers, name) {
  if (!headers) return undefined;
  return headers[name] !== undefined ? headers[name] : headers[name.toLowerCase()];
}

// Standard CORS/JSON response headers, scoped to the resolved request origin
// when it is allowed (echoing only allowed origins, never "*" with credentials).
function corsHeaders(allowedOrigin) {
  const h = {
    'Content-Type': 'application/json',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (allowedOrigin) h['Access-Control-Allow-Origin'] = allowedOrigin;
  return h;
}

function jsonResponse(statusCode, bodyObj, extraHeaders, allowedOrigin) {
  return {
    statusCode,
    headers: { ...corsHeaders(allowedOrigin), ...(extraHeaders || {}) },
    body: JSON.stringify(bodyObj)
  };
}

// Pass an upstream 2xx body through verbatim (client needs the content/JSON).
function passthroughResponse(statusCode, rawBody, allowedOrigin) {
  return {
    statusCode,
    headers: corsHeaders(allowedOrigin),
    body: rawBody
  };
}

// Best-effort token-bucket check. Returns {limited, retryAfter}.
function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    return { limited: true, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}

// Canonical, SERVER-OWNED response schemas. The browser may REQUEST one by name,
// but the server defines the body — a client cannot inject an arbitrary schema.
// Mirrors public/shared/ai-contract.js SCHEMAS (the eval harness pins that file).
const SERVER_SCHEMAS = {
  pathway: { name: 'pathway', strict: true, schema: { type:'object', additionalProperties:false,
    properties:{ primaryPathway:{type:'string'}, subcategory:{type:'string'},
      confidence:{type:'string', enum:['high','medium','low']}, reasoning:{type:'string'},
      nextSteps:{type:'array', items:{type:'string'}}, alternativePathways:{type:'array', items:{type:'string'}} },
    required:['primaryPathway','subcategory','confidence','reasoning','nextSteps','alternativePathways'] } },
  document_review: { name: 'document_review', strict: true, schema: { type:'object', additionalProperties:false,
    properties:{ overallStatus:{type:'string', enum:['looks-good','needs-attention','major-issues']},
      issues:{type:'array', items:{type:'object', additionalProperties:false,
        properties:{ severity:{type:'string', enum:['high','medium','low']}, field:{type:'string'}, problem:{type:'string'}, suggestion:{type:'string'} },
        required:['severity','field','problem','suggestion'] }},
      reminders:{type:'array', items:{type:'string'}} },
    required:['overallStatus','issues','reminders'] } },
  interview_turn: { name: 'interview_turn', strict: true, schema: { type:'object', additionalProperties:false,
    properties:{ coaching:{type:['object','null'], additionalProperties:false,
        properties:{ level:{type:'string', enum:['clear','clarify','help']}, note:{type:['string','null']} }, required:['level','note'] },
      nextQuestion:{type:'string'}, done:{type:'boolean'}, summary:{type:['string','null']} },
    required:['coaching','nextQuestion','done','summary'] } },
  notice_extract: { name: 'notice_extract', strict: true, schema: { type:'object', additionalProperties:false,
    properties:{ documentType:{type:'string'}, caseType:{type:'string'}, receiptNumber:{type:'string'},
      dates:{type:'array', items:{type:'object', additionalProperties:false, properties:{ label:{type:'string'}, date:{type:'string'} }, required:['label','date'] }},
      nextStep:{type:'string'} },
    required:['documentType','caseType','receiptNumber','dates','nextStep'] } },
};


exports.handler = async (event) => {
  const headers = event.headers || {};
  const selfHost = (header(headers, 'host') || '').toLowerCase();
  const allowSet = buildAllowSet();

  // ---- Resolve request origin from Origin, falling back to Referer ----
  const originHeader = header(headers, 'origin');
  const refererHeader = header(headers, 'referer');
  const hasOriginInfo = !!(originHeader || refererHeader);
  const reqHost = originHost(originHeader) || originHost(refererHeader);
  const allowed = hasOriginInfo && isOriginAllowed(reqHost, selfHost, allowSet);

  // Echo back the concrete request origin only when it is allowed.
  const allowedOrigin = allowed ? (originHeader || (refererHeader ? `https://${reqHost}` : undefined)) : undefined;

  // ---- OPTIONS preflight: answer with CORS headers limited to the allowlist ----
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(allowedOrigin),
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, null, allowedOrigin);
  }

  // ---- Origin allowlist enforcement ----
  // If an Origin/Referer IS present but NOT allowed -> hard 403.
  // If NO Origin/Referer at all (e.g. raw server-side curl) -> do NOT block, but
  // mark the request untrusted and downgrade model/tokens later.
  if (hasOriginInfo && !allowed) {
    return jsonResponse(403, { error: 'Origin not allowed' }, null, undefined);
  }
  const untrusted = !hasOriginInfo;

  // ---- Best-effort per-IP rate limiting ----
  const clientIp =
    header(headers, 'x-nf-client-connection-ip') ||
    header(headers, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const rl = checkRateLimit(clientIp);
  if (rl.limited) {
    return jsonResponse(
      429,
      { error: 'Too many requests, please slow down' },
      { 'Retry-After': String(rl.retryAfter) },
      allowedOrigin
    );
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return jsonResponse(500, { error: 'Server missing OPENAI_API_KEY' }, null, allowedOrigin);
  }

  if ((event.body || '').length > 24000) {
    return jsonResponse(413, { error: 'Request too large' }, null, allowedOrigin);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' }, null, allowedOrigin);
  }

  const messages = normalizeMessages(body.messages);
  if (!messages) {
    return jsonResponse(400, { error: 'Invalid messages' }, null, allowedOrigin);
  }

  // ---- Cost defense-in-depth ----
  // Trusted (same-site/allowlisted) callers get the full model allowlist and
  // token clamp. Untrusted callers (no Origin/Referer) are forced to the cheap
  // model and a tighter token cap regardless of what they requested.
  let model = ALLOWED.has(body.model) ? body.model : DEFAULT_MODEL;
  let maxTokens = clampNumber(body.max_tokens, MAX_TOKENS_DEFAULT, MAX_TOKENS_MIN, MAX_TOKENS_MAX);
  if (untrusted) {
    model = DEFAULT_MODEL;
    maxTokens = Math.min(maxTokens, UNTRUSTED_MAX_TOKENS);
  }

  // Never trust arbitrary client-supplied fields; forward only the small surface
  // the browser needs and clamp model/settings to predictable limits.
  const payload = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: clampNumber(body.temperature, 0.4, 0, 1)
  };

  // ---- Structured Outputs, forwarded only when recognized and well-formed ----
  // {type:'json_object'} or {type:'json_schema', json_schema:{...}}.
  const rf = body.response_format;
  if (rf && typeof rf === 'object') {
    if (rf.type === 'json_object') {
      payload.response_format = { type: 'json_object' };
    } else if (rf.type === 'json_schema') {
      // The browser names the feature; the SERVER owns the schema body. Unknown
      // names get a clean 400 (no silent undefined, no client-defined schemas).
      const requested = rf.json_schema && rf.json_schema.name;
      const canonical = requested && SERVER_SCHEMAS[requested];
      if (!canonical) {
        return jsonResponse(400, { error: 'Unsupported response schema' }, null, allowedOrigin);
      }
      payload.response_format = { type: 'json_schema', json_schema: canonical };
    }

  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(payload)
    });

    // ---- Error hygiene ----
    // On a non-2xx, NEVER forward the raw upstream body (it can leak org/key
    // hints, rate-limit internals, etc.). Return a generic error with the
    // upstream status (or 502 if it is somehow falsy).
    if (!r.ok) {
      return jsonResponse(r.status || 502, { error: 'AI service error' }, null, allowedOrigin);
    }

    // On 2xx, pass the body through verbatim: the client needs the assistant
    // content / structured JSON.
    const text = await r.text();
    return passthroughResponse(r.status, text, allowedOrigin);
  } catch {
    // Never surface the raw fetch error string.
    return jsonResponse(502, { error: 'Upstream request failed' }, null, allowedOrigin);
  }
};
