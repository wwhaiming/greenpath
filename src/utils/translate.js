import { ISO } from '../constants/languages.js'

export async function translateAI(text, from, to) {
  const fromTxt = from === 'auto' ? 'the detected source language' : from
  const prompt = `Translate the text below from ${fromTxt} into ${to}. Return ONLY the translation — no notes, no quotes, no language labels.\n\nText:\n${text}`
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
}

export async function translateFree(text, from, to) {
  const sl = from === 'auto' ? 'auto' : (ISO[from] || 'auto')
  const tl = ISO[to] || 'en'
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sl +
    '&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text)
  const res = await fetch(url)
  if (!res.ok) throw new Error('tx ' + res.status)
  const data = await res.json()
  return (data[0] || []).map(seg => seg[0]).join('').trim()
}

// Newline-delimited numbered sentinels survive translation far better than an
// inline punctuation separator (the service often mangles ` ~|~ `), so batch
// realignment succeeds and we avoid N per-string fallback calls.
const segMarker = (i) => `[[SEG_${i}]]`
// Tolerate whitespace the service may inject around the digits/brackets.
const SEG_RE = /\[\[\s*SEG_(\d+)\s*\]\]/g

export async function translateBatch(strings, to) {
  const out = new Array(strings.length)
  const chunks = []
  let batch = [], idx = [], len = 0
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]
    if (batch.length && len + s.length > 4500) { chunks.push({ batch, idx }); batch = []; idx = []; len = 0 }
    batch.push(s); idx.push(i); len += s.length + 16
  }
  if (batch.length) chunks.push({ batch, idx })

  await Promise.all(chunks.map(async ({ batch, idx }) => {
    try {
      const joined = batch.map((s, k) => `${segMarker(k)}\n${s}`).join('\n')
      const res = await translateFree(joined, 'auto', to)
      // Realign by marker number rather than positional order: walk the
      // sentinels in the translated text and slice each segment between them.
      const parts = new Array(batch.length)
      let m, last = null, lastIdx = -1, count = 0
      SEG_RE.lastIndex = 0
      while ((m = SEG_RE.exec(res)) !== null) {
        if (last !== null) parts[lastIdx] = res.slice(last, m.index).trim()
        lastIdx = Number(m[1]); last = SEG_RE.lastIndex; count++
      }
      if (last !== null) parts[lastIdx] = res.slice(last).trim()
      if (count === batch.length && parts.every(p => p != null)) {
        parts.forEach((p, k) => { out[idx[k]] = p }); return
      }
    } catch (_) { /* fall through */ }
    await Promise.all(batch.map(async (s, k) => {
      try { out[idx[k]] = await translateFree(s, 'auto', to) } catch (_) { out[idx[k]] = s }
    }))
  }))
  return out
}

export function detectLang(t) {
  if (/[一-鿿]/.test(t)) return 'Mandarin Chinese'
  if (/[؀-ۿ]/.test(t)) return 'Arabic'
  if (/[가-힯]/.test(t)) return 'Korean'
  if (/[ऀ-ॿ]/.test(t)) return 'Hindi'
  const l = ' ' + t.toLowerCase() + ' '
  if (/[ñ¿¡]|\b(necesito|documentos|ayuda|para|próximo|qué)\b/.test(l)) return 'Spanish'
  if (/\b(je|vous|bonjour|besoin|prochaine|documents)\b/.test(l)) return 'French'
  if (/\b(preciso|documentos|próximo|ajuda)\b/.test(l)) return 'Portuguese'
  return 'English'
}

// --- Full-page DOM translation ---

let i18nNodes = null
// Per-language Map<englishText, translatedText>. Keying by source string (not
// positional index) means a cached translation always applies to the matching
// node, even after navigation changes the node set's shape/order.
let i18nCache = {}
let i18nBusy = false

function collectNodes() {
  if (i18nNodes) return i18nNodes
  i18nNodes = []
  const SKIP = new Set(['SCRIPT', 'STYLE', 'OPTION', 'TEXTAREA', 'INPUT', 'SELECT'])
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      let p = n.parentElement
      while (p) {
        if (SKIP.has(p.tagName) || p.classList.contains('no-i18n')) return NodeFilter.FILTER_REJECT
        p = p.parentElement
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let node
  while ((node = walker.nextNode())) i18nNodes.push({ node, en: node.nodeValue })
  return i18nNodes
}

export async function setSiteLanguage(lang) {
  if (i18nBusy) return
  // Reset node cache so we pick up newly rendered page content
  i18nNodes = null
  const nodes = collectNodes()
  if (lang === 'English') { nodes.forEach(n => { n.node.nodeValue = n.en }); return }
  i18nBusy = true
  const bar = document.createElement('div')
  bar.className = 'lang-loading'
  document.body.appendChild(bar)
  try {
    const cache = i18nCache[lang] || (i18nCache[lang] = new Map())
    // Only translate distinct strings not already cached for this language.
    const seen = new Set()
    const missing = []
    for (const n of nodes) {
      if (!cache.has(n.en) && !seen.has(n.en)) { seen.add(n.en); missing.push(n.en) }
    }
    if (missing.length) {
      const values = await translateBatch(missing, lang)
      missing.forEach((en, i) => { if (values[i]) cache.set(en, values[i]) })
    }
    // Apply by each node's own source text, never by positional index.
    nodes.forEach(n => { const t = cache.get(n.en); if (t) n.node.nodeValue = t })
    document.documentElement.lang = (ISO[lang] || 'en').split('-')[0]
  } catch (_) {
    // leave English on hard failure
  } finally {
    i18nBusy = false
    bar.remove()
  }
}
