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

export async function translateBatch(strings, to) {
  const SEP = ' ~|~ '
  const out = new Array(strings.length)
  const chunks = []
  let batch = [], idx = [], len = 0
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]
    if (batch.length && len + s.length > 4500) { chunks.push({ batch, idx }); batch = []; idx = []; len = 0 }
    batch.push(s); idx.push(i); len += s.length + SEP.length
  }
  if (batch.length) chunks.push({ batch, idx })

  await Promise.all(chunks.map(async ({ batch, idx }) => {
    try {
      const res = await translateFree(batch.join(SEP), 'auto', to)
      const parts = res.split(/\s*~\s*\|\s*~\s*/)
      if (parts.length === batch.length) { parts.forEach((p, k) => out[idx[k]] = p.trim()); return }
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

// Call after each navigation to invalidate the node cache so new page content gets picked up
export function resetI18nCache() {
  i18nNodes = null
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
    let values
    if (i18nCache[lang]) { values = i18nCache[lang] }
    else { values = await translateBatch(nodes.map(n => n.en), lang); i18nCache[lang] = values }
    nodes.forEach((n, i) => { if (values[i]) n.node.nodeValue = values[i] })
    document.documentElement.lang = (ISO[lang] || 'en').split('-')[0]
  } catch (_) {
    // leave English on hard failure
  } finally {
    i18nBusy = false
    bar.remove()
  }
}
