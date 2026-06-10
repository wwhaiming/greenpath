import { useState, useRef } from 'react'
import { extractWithAI } from '../utils/api.js'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

const PALETTE = ['c-terra', 'c-amber', 'c-slate', 'c-green']
const DATEPILL = { 'c-terra': 'd-terra', 'c-amber': 'd-amber', 'c-slate': 'd-slate', 'c-green': 'd-green' }
const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const today = new Date()

function daysAway(d) {
  return Math.round((new Date(d + 'T00:00:00') - new Date(today.toDateString())) / 86400000)
}
function awayText(n) {
  if (n < 0) return Math.abs(n) + ' days ago'
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return n + ' days away'
}

function localParse(text) {
  const months = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
    jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11}
  const out = []
  const re = /([a-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/gi
  let m
  while ((m = re.exec(text))) {
    const mo = months[m[1].toLowerCase()]
    if (mo === undefined) continue
    let yr = m[3] ? +m[3] : today.getFullYear()
    let d = new Date(yr, mo, +m[2])
    if (!m[3] && d < today) d = new Date(yr + 1, mo, +m[2])
    const iso = d.toISOString().slice(0, 10)
    const before = text.slice(0, m.index).split(/[.;\n]/).pop().trim().split(/\s+/).slice(-4).join(' ')
    out.push({ date: iso, label: (before || 'Important date').replace(/^\w/, c => c.toUpperCase()).slice(0, 40) })
  }
  return out
}

let nextId = 1

export default function DeadlineAlerts() {
  const [reminders, setReminders] = useState([])
  const [channel, setChannel] = useState('In-browser reminders')
  const [timing, setTiming] = useState('7')
  const [filter, setFilter] = useState('all')
  const [showSrc, setShowSrc] = useState(false)
  const [aiDesc, setAiDesc] = useState('')
  const [aiStatus, setAiStatus] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const newDateRef = useRef()
  const newLabelRef = useRef()

  function addReminder(date, label, note) {
    if (!date || !label) return
    setReminders(prev => [...prev, { id: nextId++, date, label, note: note || '' }])
  }

  function removeReminder(id) {
    setReminders(prev => prev.filter(r => r.id !== id))
  }

  async function handleExtract() {
    const text = aiDesc.trim()
    if (!text) { setAiStatus('Type a few sentences first.'); return }
    setAiStatus('Reading your description…')
    setAiLoading(true)
    try {
      const items = await extractWithAI(text)
      if (!items.length) {
        setAiStatus('No clear dates found — try including months and days.')
      } else {
        items.forEach(it => addReminder(it.date, it.label, it.note || 'AI-extracted'))
        setAiStatus(`Added ${items.length} date${items.length !== 1 ? 's' : ''} to your timeline.`)
        setAiDesc('')
      }
    } catch (_) {
      const items = localParse(text)
      if (items.length) {
        items.forEach(it => addReminder(it.date, it.label, 'Extracted offline'))
        setAiStatus(`Added ${items.length} date${items.length !== 1 ? 's' : ''} (offline parser).`)
        setAiDesc('')
      } else {
        setAiStatus('Could not reach the AI service. Add the date manually below.')
      }
    } finally {
      setAiLoading(false)
    }
  }

  function handleManualAdd() {
    const d = newDateRef.current.value
    const l = newLabelRef.current.value.trim()
    if (!d || !l) { alert('Pick a date and type a reminder.'); return }
    addReminder(d, l, 'User-entered reminder')
    newDateRef.current.value = ''
    newLabelRef.current.value = ''
  }

  // Filter and sort
  let list = [...reminders].sort((a, b) => a.date.localeCompare(b.date))
  if (filter !== 'all') list = list.filter(r => { const n = daysAway(r.date); return n >= 0 && n <= +filter })

  // Summary text
  const shown = list.length
  const next = [...reminders].filter(r => daysAway(r.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0]
  const timingLabels = { '1':'1 day before','3':'3 days before','7':'7 days before','14':'14 days before','30':'30 days before' }
  let summary = `Tracking ${reminders.length} date${reminders.length !== 1 ? 's' : ''} · showing ${shown}. `
  if (next) summary += `${channel} will alert you ${timingLabels[timing]?.toLowerCase() ?? timing} each date. Next: ${next.label} (${awayText(daysAway(next.date))}).`
  else summary += 'No upcoming dates.'

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Deadline Alerts</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        See important dates before they become urgent.
      </h1>
      <p className="lede">Based on dates you enter and dated official public sources.</p>

      <div className="da-grid">
        {/* Timeline card */}
        <div className="timeline-card">
          <div className="kicker">Upcoming timeline</div>

          <div className="ai-box">
            <div className="ai-box-head"><span className="ai-badge">AI</span><b>Describe your situation</b></div>
            <textarea
              value={aiDesc}
              onChange={e => setAiDesc(e.target.value)}
              placeholder="e.g. My biometrics appointment is on June 12. I got my green-card medical exam (I-693) done on March 3 — it's valid for 2 years. My priority date is in the August visa bulletin."
            />
            <div className="ai-box-foot">
              <button className="btn btn-primary" onClick={handleExtract} disabled={aiLoading}>
                Extract Dates with AI
              </button>
              <small>{aiStatus}</small>
            </div>
          </div>

          {/* Timeline list */}
          {list.length === 0 ? (
            <div className="tl-empty">Your timeline is empty. Describe your situation above and let AI pull out the important dates — or add one manually below.</div>
          ) : (
            list.map((r, i) => {
              const c = PALETTE[i % PALETTE.length]
              const dt = new Date(r.date + 'T00:00:00')
              const pill = MON[dt.getMonth()] + ' ' + String(dt.getDate()).padStart(2, '0')
              return (
                <div key={r.id} className="tl-item">
                  <div className={`tl-dot ${c}`} />
                  <div className={`tl-date ${DATEPILL[c]}`}>{pill}</div>
                  <div className="tt">
                    <b>{r.label}</b>
                    <p>{r.note || awayText(daysAway(r.date))}</p>
                  </div>
                  <button className="tl-x" onClick={() => removeReminder(r.id)} title="Remove">×</button>
                </div>
              )
            })
          )}

          <div className="add-row">
            <input type="date" ref={newDateRef} />
            <input type="text" ref={newLabelRef} placeholder="Add your own reminder…" />
            <button className="btn btn-ghost" onClick={handleManualAdd} style={{ padding: '16px 26px' }}>Add</button>
          </div>
        </div>

        {/* Settings card */}
        <div className="settings-card">
          <div className="kicker">Alert settings</div>
          <div className="field-label">Notification channel</div>
          <select value={channel} onChange={e => setChannel(e.target.value)}>
            <option>In-browser reminders</option>
            <option>Email reminders</option>
            <option>Email + in-browser</option>
            <option>No notifications</option>
          </select>
          <div className="field-label">Reminder timing</div>
          <select value={timing} onChange={e => setTiming(e.target.value)}>
            <option value="1">1 day before</option>
            <option value="3">3 days before</option>
            <option value="7">7 days before</option>
            <option value="14">14 days before</option>
            <option value="30">30 days before</option>
          </select>
          <div className="field-label">Calendar filter</div>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All upcoming dates</option>
            <option value="30">Next 30 days</option>
            <option value="60">Next 60 days</option>
          </select>
          <div className="settings-summary">{summary}</div>
          <div className="src-row">
            <button
              className="src-pill"
              onClick={() => setShowSrc(v => !v)}
              style={showSrc ? { background: '#dfeae0' } : {}}
            >
              OFFICIAL SOURCE DATES
            </button>
            <small>Show source and last-updated date.</small>
          </div>
          {showSrc && (
            <div className="src-panel">
              <div className="src-line"><b>USCIS processing times</b><span>updated May 28, 2026</span></div>
              <div className="src-line"><b>Visa Bulletin (travel.state.gov)</b><span>updated May 15, 2026</span></div>
              <div className="src-line"><b>I-693 medical validity</b><span>2 years from exam date</span></div>
              <small className="src-foot">Dates are drawn from public government sources. Always confirm against the official notice for your case.</small>
            </div>
          )}
        </div>
      </div>
      <LegalDisclaimer page={5} />
    </section>
  )
}
