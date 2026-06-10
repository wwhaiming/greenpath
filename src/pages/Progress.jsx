import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

const STAGES = [
  { num: 1, label: 'Eligibility', note: 'Complete',     dot: 'c-green',  active: false },
  { num: 2, label: 'Gather',     note: 'In progress',  dot: 'c-amber',  active: true  },
  { num: 3, label: 'File',       note: 'Next',          dot: 'c-slate',  active: false },
  { num: 4, label: 'Biometrics', note: 'Later',         dot: 'muted',    active: false },
  { num: 5, label: 'Interview',  note: 'Later',         dot: 'muted',    active: false },
  { num: 6, label: 'Decision',   note: 'Later',         dot: 'muted',    active: false },
]

const CHECKLIST = [
  { label: 'Identity document',      done: true  },
  { label: 'Birth certificate',       done: true  },
  { label: 'Passport-style photos',   done: false },
  { label: 'Form checklist review',   done: false },
]

export default function Progress() {
  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Progress Tracking</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        A roadmap makes a long process feel manageable.
      </h1>

      <div style={{ marginTop: '40px' }}>
        <div className="prog-top">
          <h3>Your personalized roadmap</h3>
          <span className="pct">42% complete</span>
        </div>
        <div className="pbar"><i /></div>
        <div className="stagerow">
          {STAGES.map(st => (
            <div key={st.num} className="stage">
              <div className={`sdot ${st.dot}`}>{st.num}</div>
              <h4>{st.label}</h4>
              <small className={st.active ? 'act' : ''}>{st.note}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="checkpoint">
        <div className="kicker">Current checkpoint</div>
        <h2>Gather supporting documents</h2>
        <div className="cp-grid">
          {CHECKLIST.map(item => (
            <div key={item.label} className="cp-item">
              <div className={`cp-box${item.done ? ' checked' : ''}`} />
              <div>
                <div className="ct">{item.label}</div>
                <span className={`status ${item.done ? 'complete' : 'inprog'}`}>
                  {item.done ? 'COMPLETE' : 'IN PROGRESS'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <LegalDisclaimer page={4} />
    </section>
  )
}
