import { useState } from 'react'
import { STEPS, pathwayResult } from '../constants/quizSteps.js'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

export default function GuidedWalkthrough({ navigate }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState(Array(6).fill(''))
  const [done, setDone] = useState(false)
  const [result, setResult] = useState(null)

  const s = STEPS[step]
  const progress = ((step + 1) / 6) * 100

  function handleSelect(val) {
    const next = [...answers]
    next[step] = val
    setAnswers(next)
  }

  function handleNext() {
    if (!answers[step]) return
    if (step < 5) {
      setStep(step + 1)
    } else {
      const [title, body] = pathwayResult(answers)
      setResult({ title, body })
      setDone(true)
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1)
  }

  function handleRestart() {
    setStep(0)
    setAnswers(Array(6).fill(''))
    setDone(false)
    setResult(null)
  }

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Guided Walkthrough</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.4vw,56px)', marginTop: '8px' }}>
        A few questions reveal a possible pathway.
      </h1>
      <p className="lede">One calm question at a time. No legal terminology required.</p>

      <div className="gw-grid">
        {/* Intake sidebar */}
        <div className="intake">
          <div className="kicker">Your intake</div>
          {STEPS.map((st, idx) => {
            let icClass, icContent
            if (done || idx < step) { icClass = 'ic done'; icContent = '✓' }
            else if (idx === step) { icClass = 'ic cur'; icContent = idx + 1 }
            else { icClass = 'ic todo'; icContent = idx + 1 }
            return (
              <div key={idx} className={`istep${idx === step && !done ? ' active' : ''}`}>
                <div className={icClass}>{icContent}</div>
                <span>{st.label}</span>
              </div>
            )
          })}
        </div>

        {/* Question or Result card */}
        {done && result ? (
          <div className="qcard">
            <div className="qlabel" style={{ color: 'var(--green-mid)' }}>YOUR POSSIBLE PATHWAY</div>
            <div className="qbar"><i style={{ width: '100%' }} /></div>
            <h2>{result.title}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '16px', marginBottom: '8px' }}>{result.body}</p>
            <div className="ai-assist" style={{ margin: '18px 0' }}>
              <b>Important</b>
              <p>This is general information based on your answers — not a legal determination. Complex situations should be reviewed with an authorized immigration attorney.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => navigate('progress')}>See My Roadmap</button>
              <button className="btn btn-ghost" onClick={handleRestart}>Start Over</button>
            </div>
          </div>
        ) : (
          <div className="qcard">
            <div className="qlabel">QUESTION {step + 1} OF 6</div>
            <div className="qbar"><i style={{ width: `${progress}%` }} /></div>
            <h2>{s.q}</h2>
            <div className="q-row">
              <div>
                <select value={answers[step]} onChange={e => handleSelect(e.target.value)}>
                  <option value="">Select an answer</option>
                  {s.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <div className="q-foot"><small>{s.hint}</small></div>
              </div>
              <div>
                <div className="ai-assist">
                  <b>AI Assistance</b>
                  <p>{s.tip}</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button className="btn btn-ghost" onClick={handleBack} disabled={step === 0} style={{ padding: '14px 22px' }}>Back</button>
                  <button className="btn btn-primary" onClick={handleNext} disabled={!answers[step]}>
                    {step === 5 ? 'See Pathway' : 'Continue'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <LegalDisclaimer page={3} />
    </section>
  )
}
