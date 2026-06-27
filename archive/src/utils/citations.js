// ===== Grounding + citation rendering (extracted verbatim) =====
export const USCIS_SOURCES = [
  { id: 'forms',      title: 'USCIS Forms',                     url: 'https://www.uscis.gov/forms', topics: ['form', 'filing', 'i-130', 'i-485', 'i-765', 'i-131', 'n-400', 'i-693'] },
  { id: 'i-485',      title: 'I-485 Adjustment of Status',      url: 'https://www.uscis.gov/i-485', topics: ['adjustment', 'inside the united states', 'i-485', 'green card application'] },
  { id: 'i-130',      title: 'I-130 Petition for Relative',     url: 'https://www.uscis.gov/i-130', topics: ['family', 'sponsor', 'spouse', 'parent', 'child', 'sibling', 'i-130', 'relative'] },
  { id: 'employment', title: 'Green Card through Employment',   url: 'https://www.uscis.gov/green-card/green-card-eligibility/green-card-for-employment-based-immigrants', topics: ['employment', 'job', 'employer', 'perm', 'labor', 'eb-1', 'eb-2', 'eb-3'] },
  { id: 'bulletin',   title: 'Visa Bulletin (priority dates)',  url: 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html', topics: ['priority date', 'visa bulletin', 'wait', 'backlog', 'category', 'country cap'] },
  { id: 'times',      title: 'USCIS Processing Times',          url: 'https://egov.uscis.gov/processing-times/', topics: ['processing time', 'how long', 'timeline', 'wait time'] },
  { id: 'fees',       title: 'USCIS Fee Schedule',              url: 'https://www.uscis.gov/g-1055', topics: ['fee', 'cost', 'price', 'payment', 'how much'] },
  { id: 'rfe',        title: 'Responding to an RFE',            url: 'https://www.uscis.gov/forms/filing-guidance/responding-to-an-rfe', topics: ['rfe', 'request for evidence', 'evidence', 'missing'] },
  { id: 'status',     title: 'Check Case Status',               url: 'https://egov.uscis.gov/casestatus/', topics: ['case status', 'receipt number', 'i-797', 'tracking'] },
  { id: 'legal-help', title: 'Find Authorized Legal Services',  url: 'https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/find-legal-services', topics: ['attorney', 'lawyer', 'legal help', 'accredited', 'representation'] },
  { id: '8cfr',       title: '8 CFR — Immigration Regulations', url: 'https://www.ecfr.gov/current/title-8', topics: ['regulation', '8 cfr', 'rule', 'eligibility', 'requirement', 'statute', 'code', 'law'] },
  { id: 'policy',     title: 'USCIS Policy Manual',             url: 'https://www.uscis.gov/policy-manual', topics: ['policy', 'discretion', 'adjudicate', 'adjudication', 'guidance', 'manual', 'standard'] },
  { id: 'perm',       title: 'PERM Labor Certification (DOL)',  url: 'https://www.dol.gov/agencies/eta/foreign-labor/programs/permanent', topics: ['perm', 'labor certification', 'prevailing wage', 'eb-2', 'eb-3', 'recruitment', 'sponsor employer'] },
  { id: 'feecalc',    title: 'USCIS Fee Calculator',            url: 'https://www.uscis.gov/feecalculator', topics: ['fee calculator', 'how much', 'total cost', 'combined fee', 'filing fees'] },
]

export function pickSources(query, max = 5) {
  const q = (query || '').toLowerCase()
  const hit = USCIS_SOURCES.filter(s => s.topics.some(t => q.includes(t)))
  return (hit.length ? hit : USCIS_SOURCES).slice(0, max)
}

export function sourcesPrompt(query) {
  return pickSources(query).map(s => `[${s.id}] ${s.title} — ${s.url}`).join('\n')
}

export const GROUNDING_RULE = 'Ground every factual claim in the OFFICIAL sources listed below, and CITE each claim inline using the bracketed source id right after the sentence or claim it supports — e.g. "You file Form I-130 to petition for a relative [i-130]. Processing times vary by office and change often [times]." Only use [id] tags for ids that appear in the OFFICIAL SOURCES list below; never invent an id. Put the [id] immediately after the claim it backs; not every sentence needs a citation. Never invent fees, dollar amounts, dates, or processing times — if asked for a specific number, say it changes and tell the user to verify on the cited page. Keep it plain-language. This is general information, NOT legal advice; for complex cases point to authorized legal help.'

export const SOURCE_BY_ID = USCIS_SOURCES.reduce((m, s) => { m[s.id] = s; return m }, {})
export const CITE_RE = /\[([a-z0-9-]+)\]/gi

export function citedIds(text) {
  const out = [], seen = Object.create(null)
  for (const m of String(text || '').matchAll(CITE_RE)) {
    const id = m[1].toLowerCase()
    if (SOURCE_BY_ID[id] && !seen[id]) { seen[id] = 1; out.push(id) }
  }
  return out
}

// Replace each valid [id] token with a numbered superscript link (DOM, no innerHTML).
export function linkifyCitations(text, numbers) {
  numbers = numbers || Object.create(null)
  let next = 1; for (const k in numbers) { if (numbers[k] >= next) next = numbers[k] + 1 }
  const frag = document.createDocumentFragment()
  const s = String(text || ''); let last = 0
  for (const m of s.matchAll(CITE_RE)) {
    const id = m[1].toLowerCase(), src = SOURCE_BY_ID[id]
    if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)))
    last = m.index + m[0].length
    if (!src) continue
    if (!numbers[id]) numbers[id] = next++
    const sup = document.createElement('sup')
    const a = document.createElement('a')
    a.className = 'cite-inline'; a.href = src.url; a.target = '_blank'; a.rel = 'noopener'
    a.title = src.title; a.textContent = '[' + numbers[id] + ']'
    sup.appendChild(a); frag.appendChild(sup)
  }
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)))
  frag._numbers = numbers
  return frag
}

export function citationsForIds(ids) {
  const items = ids.map(id => SOURCE_BY_ID[id]).filter(Boolean)
    .map((s, i) => `<a class="cite" href="${s.url}" target="_blank" rel="noopener">${i + 1}. ${s.title}</a>`).join('')
  return `<div class="cite-row"><span class="cite-label">Verified sources</span><div class="cite-list">${items}</div></div>`
}

export function citationsFromText(text, fallbackQuery) {
  const ids = citedIds(text)
  return ids.length ? citationsForIds(ids) : citationsHTML(fallbackQuery)
}

export function citationsHTML(query) {
  const items = pickSources(query).map(s => `<a class="cite" href="${s.url}" target="_blank" rel="noopener">${s.title}</a>`).join('')
  return `<div class="cite-row"><span class="cite-label">Verified sources</span><div class="cite-list">${items}</div></div>`
}
