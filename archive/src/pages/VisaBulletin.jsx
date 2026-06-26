import { useState } from 'react'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

const FAMILY = [
  { cat: 'F1', who: 'Unmarried adult children of U.S. citizens', date: '01 SEP 2017' },
  { cat: 'F2A', who: 'Spouses and children of green-card holders', date: 'Current' },
  { cat: 'F2B', who: 'Unmarried adult children of green-card holders', date: '22 MAY 2016' },
  { cat: 'F3', who: 'Married children of U.S. citizens', date: '08 JAN 2010' },
  { cat: 'F4', who: 'Siblings of U.S. citizens', date: '15 MAR 2007' },
]

const EMPLOYMENT = [
  { cat: 'EB-1', who: 'Priority workers, extraordinary ability', date: 'Current' },
  { cat: 'EB-2', who: 'Advanced degrees, exceptional ability', date: '12 NOV 2022' },
  { cat: 'EB-3', who: 'Skilled workers and professionals', date: '03 FEB 2023' },
  { cat: 'EB-5', who: 'Investors (unreserved)', date: 'Current' },
]

function Row({ cat, who, date }) {
  const current = date === 'Current'
  return (
    <div className="src-line">
      <b>{cat} — {who}</b>
      <span style={current ? { color: 'var(--green, #1f8156)', fontWeight: 700 } : {}}>{date}</span>
    </div>
  )
}

export default function VisaBulletin() {
  const [chart, setChart] = useState('family')
  const rows = chart === 'family' ? FAMILY : EMPLOYMENT

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Visa Bulletin</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        Know when your priority date is current.
      </h1>
      <p className="lede">
        The Visa Bulletin is the State Department's monthly queue for limited green card categories.
        When the chart shows a date at or after your priority date — or says "Current" — your turn has come.
      </p>

      <div className="dr-grid">
        <div className="dr-left">
          <div className="kicker">How to read it</div>
          <div className="dr-summary">Your priority date is on your receipt notice (Form I-797), usually the day USCIS received your petition.</div>
          <div className="issue blu"><div className="idot" /><div><p><b>"Current"</b> means no waiting line — visas are available for everyone in that category right now.</p></div></div>
          <div className="issue blu"><div className="idot" /><div><p>A <b>date</b> means only people who filed before that date can move forward this month.</p></div></div>
          <div className="issue amb"><div className="idot" /><div><p>Dates can move forward, stall, or even move backward ("retrogress") month to month.</p></div></div>
          <p className="tiny" style={{ marginTop: '14px' }}>
            Sample chart for demonstration. Check the official monthly bulletin at{' '}
            <a href="https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html" target="_blank" rel="noreferrer">travel.state.gov</a>.
          </p>
        </div>

        <div className="dr-right">
          <div className="kicker">Final action dates (sample)</div>
          <div className="dr-actions" style={{ marginTop: 0, marginBottom: '14px' }}>
            <button className={chart === 'family' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setChart('family')}>Family-based</button>
            <button className={chart === 'employment' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setChart('employment')}>Employment-based</button>
          </div>
          {rows.map(r => <Row key={r.cat} {...r} />)}
          <small style={{ display: 'block', marginTop: '12px' }}>Immediate relatives of U.S. citizens (spouse, parent, child under 21) are never in this queue — visas are always available.</small>
        </div>
      </div>
      <LegalDisclaimer page={11} />
    </section>
  )
}
