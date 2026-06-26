// ===== AI helpers (server-proxied via /api/chat) =====
// Extracted verbatim from the original single-page app. The server (server.py)
// holds OPENAI_API_KEY; the browser sends no credentials.

export const AI_ENDPOINT = '/api/chat'
export const AI_MODEL = 'gpt-4o-mini'
// Route hard reasoning (pathway/review/interview) to gpt-4o; cheap tasks stay on mini.
export const AI_SMART = 'gpt-4o'

export async function aiChatMessages(messages, opts = {}) {
  const body = {
    model: opts.model || AI_MODEL,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.max_tokens ?? 900,
  }
  if (opts.response_format) body.response_format = opts.response_format
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('proxy ' + res.status)
  const data = await res.json()
  if (data.error) throw new Error((data.error && data.error.message) || data.error || 'proxy error')
  return (data.choices?.[0]?.message?.content || '').trim()
}

export async function aiChat(prompt, system, opts = {}) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt })
  return aiChatMessages(messages, opts)
}

// parses a JSON object/array out of the reply (strips fences/prose)
export function parseLooseJSON(txt) {
  txt = txt.replace(/```json|```/g, '').trim()
  const start = txt.search(/[\[{]/)
  if (start < 0) throw new Error('no JSON found')
  const opener = txt[start], closer = opener === '{' ? '}' : ']'
  let depth = 0, inString = false, escaped = false
  for (let i = start; i < txt.length; i++) {
    const ch = txt[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else {
      if (ch === '"') inString = true
      else if (ch === opener) depth++
      else if (ch === closer) {
        depth--
        if (depth === 0) return JSON.parse(txt.slice(start, i + 1))
      }
    }
  }
  return JSON.parse(txt.slice(start))
}

export async function aiJSON(prompt, system, opts = {}) {
  const txt = await aiChat(prompt, system, opts)
  return parseLooseJSON(txt)
}

// ===== Structured Outputs: guarantee schema-valid JSON (no regex scraping) =====
export const SCHEMAS = {
  pathway: { name: 'pathway', schema: { type: 'object', additionalProperties: false,
    properties: { primaryPathway: { type: 'string' }, subcategory: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, reasoning: { type: 'string' },
      nextSteps: { type: 'array', items: { type: 'string' } },
      alternativePathways: { type: 'array', items: { type: 'string' } } },
    required: ['primaryPathway', 'subcategory', 'confidence', 'reasoning', 'nextSteps', 'alternativePathways'] } },
  review: { name: 'document_review', schema: { type: 'object', additionalProperties: false,
    properties: { overallStatus: { type: 'string', enum: ['looks-good', 'needs-attention', 'major-issues'] },
      issues: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, field: { type: 'string' },
          problem: { type: 'string' }, suggestion: { type: 'string' } },
        required: ['severity', 'field', 'problem', 'suggestion'] } },
      reminders: { type: 'array', items: { type: 'string' } } },
    required: ['overallStatus', 'issues', 'reminders'] } },
  interview: { name: 'interview_turn', schema: { type: 'object', additionalProperties: false,
    properties: { coaching: { type: ['object', 'null'], additionalProperties: false,
        properties: { level: { type: 'string', enum: ['clear', 'clarify', 'help'] }, note: { type: ['string', 'null'] } },
        required: ['level', 'note'] },
      nextQuestion: { type: 'string' }, done: { type: 'boolean' }, summary: { type: ['string', 'null'] } },
    required: ['coaching', 'nextQuestion', 'done', 'summary'] } },
  notice: { name: 'notice_extract', schema: { type: 'object', additionalProperties: false,
    properties: { documentType: { type: 'string' }, caseType: { type: 'string' }, receiptNumber: { type: 'string' },
      dates: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { label: { type: 'string' }, date: { type: 'string' } }, required: ['label', 'date'] } },
      nextStep: { type: 'string' } },
    required: ['documentType', 'caseType', 'receiptNumber', 'dates', 'nextStep'] } },
}

export async function aiJSONSchema(prompt, system, schema, opts = {}) {
  try {
    const rf = { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } }
    const txt = await aiChat(prompt, system, { ...opts, response_format: rf })
    return parseLooseJSON(txt)
  } catch (e) {
    return aiJSON(prompt, system, opts) // graceful degrade if response_format unsupported
  }
}

// "stream": the proxy returns one buffered reply, so we reveal it like a typewriter.
export async function aiStream(messages, onToken, opts = {}) {
  const full = await aiChatMessages(messages, opts)
  const step = Math.max(1, Math.round(full.length / 90))
  let pending = null, scheduled = false
  const flush = () => { scheduled = false; if (pending) { onToken(pending.delta, pending.soFar); pending = null } }
  for (let i = 0; i < full.length; i += step) {
    pending = { delta: full.slice(i, i + step), soFar: full.slice(0, i + step) }
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush) }
    await new Promise(r => setTimeout(r, 16))
  }
  pending = null
  onToken('', full)
  return full
}

// back-compat aliases
export const claudeChat = aiChat, claudeJSON = aiJSON

// Friendly, never-silent failure message for any AI feature.
export function aiErrorHTML(err) {
  const offline = /proxy 5\d\d|Failed to fetch|NetworkError|proxy error/i.test(String((err && err.message) || err))
  const msg = offline
    ? 'The AI service is not reachable right now. Your information is safe — try again in a moment, or continue using the offline tools.'
    : 'Something went wrong generating that response. Please try again.'
  return `<div class="ai-error" role="alert"><b>Couldn’t complete that</b><span>${msg}</span></div>`
}
