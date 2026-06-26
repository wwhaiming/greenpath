const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export function esc(s) {
  return (s || '').replace(/[&<>"]/g, c => MAP[c])
}
