// Server-side proxy to the OpenAI API.
// The API key lives here as an environment variable (OPENAI_API_KEY) and is
// NEVER sent to the browser. The client posts {model, messages, ...} to /api/chat.

const ALLOWED = new Set(['gpt-4o-mini', 'gpt-4o']);
const DEFAULT_MODEL = 'gpt-4o-mini';
const ROLES = new Set(['system', 'user', 'assistant']);
const MAX_MESSAGES = 20;
const MAX_CONTENT_CHARS = 6000;
const MAX_TOTAL_CHARS = 18000;

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server missing OPENAI_API_KEY' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const messages = normalizeMessages(body.messages);
  if (!messages) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid messages' }) };
  }

  // Never trust arbitrary client-supplied fields; forward only the small surface
  // the browser needs and clamp model/settings to predictable limits.
  const payload = {
    model: ALLOWED.has(body.model) ? body.model : DEFAULT_MODEL,
    messages,
    max_tokens: clampNumber(body.max_tokens, 900, 80, 1200),
    temperature: clampNumber(body.temperature, 0.4, 0, 1)
  };

  // Forward Structured Outputs only when it is a recognized, well-formed shape:
  // {type:'json_object'} or {type:'json_schema', json_schema:{...}}.
  const rf = body.response_format;
  if (rf && typeof rf === 'object') {
    if (rf.type === 'json_object') {
      payload.response_format = { type: 'json_object' };
    } else if (rf.type === 'json_schema' && rf.json_schema && typeof rf.json_schema === 'object') {
      payload.response_format = { type: 'json_schema', json_schema: rf.json_schema };
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
    const text = await r.text();
    return {
      statusCode: r.status,
      headers: { 'Content-Type': 'application/json' },
      body: text
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Upstream request failed: ' + String(err) }) };
  }
};
