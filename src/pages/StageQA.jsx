import { useState } from 'react'
import { stageQaAI } from '../utils/api.js'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

export default function StageQA() {
  const [pathway, setPathway] = useState('Family-based')
  const [stage, setStage] = useState('Just getting started')
  const [question, setQuestion] = useState('What does Form I-130 do, and what happens after it is approved?')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAsk() {
    const q = question.trim()
    if (!q) return
    setLoading(true); setAnswer(''); setError('')
    try {
      const text = await stageQaAI(pathway, stage, q)
      setAnswer(text)
    } catch (_) {
      setError('Could not reach the AI service right now. Check your connection (or that the local server is running) and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Stage Q&amp;A</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        Ask a question about your current stage.
      </h1>
      <p className="lede">Plain-language answers about the green card process. Always verify specifics on USCIS.gov.</p>

      <div className="dr-grid">
        <div className="dr-left">
          <div className="kicker">Your question</div>
          <div className="field-label" style={{ marginTop: 0 }}>Your pathway</div>
          <select className="lt-sel-real" style={{ width: '100%', marginBottom: '14px' }} value={pathway} onChange={e => setPathway(e.target.value)}>
            <option value="Family-based">Family-based</option>
            <option value="Employment-based">Employment-based</option>
            <option value="Humanitarian (asylum/refugee)">Humanitarian (asylum/refugee)</option>
            <option value="Diversity Visa lottery">Diversity Visa lottery</option>
            <option value="Investment">Investment</option>
            <option value="Not sure">Not sure</option>
          </select>
          <div className="field-label">Current stage</div>
          <select className="lt-sel-real" style={{ width: '100%', marginBottom: '14px' }} value={stage} onChange={e => setStage(e.target.value)}>
            <option value="Just getting started">Just getting started</option>
            <option value="Petition filed">Petition filed</option>
            <option value="Waiting for a priority date">Waiting for a priority date</option>
            <option value="Biometrics scheduled">Biometrics scheduled</option>
            <option value="Interview scheduled">Interview scheduled</option>
            <option value="Decision pending">Decision pending</option>
          </select>
          <div className="field-label">Your question</div>
          <textarea
            className="lt-text"
            style={{ minHeight: '120px', fontSize: '16px', width: '100%' }}
            spellCheck={false}
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
          <div className="dr-actions">
            <button className="btn btn-primary" onClick={handleAsk} disabled={loading}>Ask GreenPath</button>
          </div>
        </div>

        <div className="dr-right">
          <div className="kicker">Answer</div>
          {loading && <LoadingSpinner label="Finding a clear answer…" />}
          {error && <div className="dr-summary">{error}</div>}
          {!loading && !error && !answer && (
            <p className="dr-placeholder">Pick your pathway and stage, type a question, and select <b>Ask GreenPath</b>. Answers are general information — not legal advice or case predictions.</p>
          )}
          {!loading && answer && (
            <div className="dr-summary" style={{ lineHeight: '1.6' }}>
              {answer.split(/\n+/).filter(Boolean).map((p, i) => (
                <p key={i} style={{ margin: '0 0 10px' }}>{p}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      <LegalDisclaimer page={10} />
    </section>
  )
}
