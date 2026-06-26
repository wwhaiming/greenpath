import { useState, useEffect } from 'react'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

const STAGES = [
  {
    num: 1, label: 'Eligibility', title: 'Confirm your eligibility',
    tasks: ['Identify your pathway (family, employment, humanitarian, lottery)', 'Check the latest Visa Bulletin for your category', 'Read the official form instructions for your case'],
  },
  {
    num: 2, label: 'Gather', title: 'Gather supporting documents',
    tasks: ['Identity document', 'Birth certificate', 'Passport-style photos', 'Form checklist review'],
  },
  {
    num: 3, label: 'File', title: 'File your petition package',
    tasks: ['Complete and sign every required form', 'Pay the correct filing fees', 'Submit the package and keep proof of delivery', 'Save your receipt notices (Form I-797)'],
  },
  {
    num: 4, label: 'Biometrics', title: 'Attend your biometrics appointment',
    tasks: ['Watch for the appointment notice', 'Bring your notice and photo ID', 'Keep the stamped confirmation afterward'],
  },
  {
    num: 5, label: 'Interview', title: 'Prepare for your interview',
    tasks: ['Watch for the interview notice', 'Organize originals of every document you filed', 'Rehearse with the Interview Prep module', 'Attend the interview'],
  },
  {
    num: 6, label: 'Decision', title: 'Receive your decision',
    tasks: ['Watch for the decision notice', 'If you get a Request for Evidence, respond before the deadline', 'If approved, confirm your card delivery address'],
  },
]

const TOTAL_TASKS = STAGES.reduce((n, s) => n + s.tasks.length, 0)
const STORE_KEY = 'gp-progress'

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY))
    if (v && typeof v.stage === 'number' && v.checked) return v
  } catch (_) { /* corrupted or unavailable — start fresh */ }
  return { stage: 2, checked: { '2:0': true, '2:1': true } }
}

export default function Progress() {
  const [state, setState] = useState(load)

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch (_) { /* private mode */ }
  }, [state])

  const stage = STAGES.find(s => s.num === state.stage) || STAGES[1]
  const doneCount = Object.values(state.checked).filter(Boolean).length
  const pct = Math.round((doneCount / TOTAL_TASKS) * 100)

  function stageStatus(s) {
    const done = s.tasks.filter((_, i) => state.checked[`${s.num}:${i}`]).length
    if (done === s.tasks.length) return 'Complete'
    if (s.num === state.stage) return 'In progress'
    return done > 0 ? 'Started' : 'Later'
  }
  function stageDot(s) {
    const status = stageStatus(s)
    if (status === 'Complete') return 'c-green'
    if (s.num === state.stage) return 'c-amber'
    return status === 'Started' ? 'c-slate' : 'muted'
  }

  function toggleTask(i) {
    const key = `${stage.num}:${i}`
    setState(prev => ({ ...prev, checked: { ...prev.checked, [key]: !prev.checked[key] } }))
  }

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Progress Tracking</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        A roadmap makes a long process feel manageable.
      </h1>
      <p className="lede">Select a stage to see its checkpoint. Checkmarks save on this device.</p>

      <div style={{ marginTop: '40px' }}>
        <div className="prog-top">
          <h3>Your personalized roadmap</h3>
          <span className="pct">{pct}% complete</span>
        </div>
        <div className="pbar"><i style={{ width: pct + '%' }} /></div>
        <div className="stagerow">
          {STAGES.map(s => (
            <div
              key={s.num}
              className="stage"
              style={{ cursor: 'pointer' }}
              onClick={() => setState(prev => ({ ...prev, stage: s.num }))}
            >
              <div className={`sdot ${stageDot(s)}`}>{s.num}</div>
              <h4>{s.label}</h4>
              <small className={s.num === state.stage ? 'act' : ''}>{stageStatus(s)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="checkpoint">
        <div className="kicker">Stage {stage.num} checkpoint</div>
        <h2>{stage.title}</h2>
        <div className="cp-grid">
          {stage.tasks.map((label, i) => {
            const done = !!state.checked[`${stage.num}:${i}`]
            return (
              <div key={label} className="cp-item" style={{ cursor: 'pointer' }} onClick={() => toggleTask(i)}>
                <div className={`cp-box${done ? ' checked' : ''}`} />
                <div>
                  <div className="ct">{label}</div>
                  <span className={`status ${done ? 'complete' : 'inprog'}`}>
                    {done ? 'COMPLETE' : 'IN PROGRESS'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <LegalDisclaimer page={4} />
    </section>
  )
}
