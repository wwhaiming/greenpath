export async function extractWithAI(text) {
  // Compute at call time so long-lived SPA sessions don't anchor to load time.
  const todayStr = new Date().toISOString().slice(0, 10)
  const prompt = `You extract immigration-related deadlines from a user's plain-language description and return them as JSON.
Today's date is ${todayStr}. The user wrote:
"""${text}"""
Return ONLY a JSON array (no prose, no markdown fences). Each element: {"date":"YYYY-MM-DD","label":"short title (max 6 words)","note":"short context (max 8 words)"}.
Rules: resolve relative dates against today. If a medical exam (I-693) is mentioned as valid 2 years, add an expiration entry 2 years after the exam date. If a year is missing, choose the next upcoming occurrence. Skip anything with no determinable date. If none, return [].`
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  let txt = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
  txt = txt.replace(/```json|```/g, '').trim()
  const arr = JSON.parse(txt)
  return Array.isArray(arr) ? arr.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) : []
}

export async function reviewAI(form, text) {
  const res = await fetch('/api/document-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document: `Form: ${form}\n\nEntries:\n${text}` }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return {
    overallStatus: data.overallStatus || 'needs-attention',
    issues: Array.isArray(data.issues) ? data.issues : [],
    reminders: Array.isArray(data.reminders) ? data.reminders : [],
  }
}

export async function interviewAI(pathway, transcript, answer) {
  const messages = []
  if (!transcript.length) {
    messages.push({ role: 'user', content: `Begin a practice interview for: ${pathway}. Start with a brief professional greeting then ask your first question.` })
  } else {
    for (const turn of transcript) {
      messages.push({ role: turn.role === 'applicant' ? 'user' : 'assistant', content: turn.content })
    }
    messages.push({ role: 'user', content: answer || '[continue]' })
  }
  const res = await fetch('/api/interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathway, transcript, answer: answer || '' }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return { coaching: data.coaching || null, nextQuestion: data.nextQuestion || '', done: !!data.done, summary: data.summary || null }
}

export async function pathwayAI(intake) {
  const res = await fetch('/api/pathway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intake }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

export async function stageQaAI(pathway, stage, question) {
  const res = await fetch('/api/stage-qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathway, stage, question }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.answer || ''
}
