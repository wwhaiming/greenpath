import { useState, useEffect } from 'react'
import { pathwayAI } from '../utils/api.js'
import IssueCard from '../components/IssueCard.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'
import { savePathwayData, loadPathwayData } from '../utils/storage.js'

const CONF = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }
const DEFAULT_INTAKE = 'I am married to a U.S. citizen and we have lived together in the U.S. for 2 years. I entered on a tourist visa that has since expired. I have no criminal history. I do not have a U.S. job offer.'

export default function PathwayFinder({ navigate }) {
  const [intake, setIntake] = useState(() => {
    const saved = loadPathwayData()
    return saved.intake || DEFAULT_INTAKE
  })
  const [result, setResult] = useState(() => loadPathwayData().result)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    savePathwayData({ intake, result })
  }, [intake, result])

  async function handleFind() {
    const text = intake.trim()
    if (!text) return
    setLoading(true); setResult(null); setError('')
    try {
      const d = await pathwayAI(text)
      setResult(d)
    } catch (_) {
      setError('Could not reach the AI service right now. Check your connection (or that the local server is running) and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Pathway Finder</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        Find your most likely green card pathway.
      </h1>
      <p className="lede">Answer in your own words. GreenPath suggests a likely pathway — general information only, not legal advice.</p>

      <div className="dr-grid">
        <div className="dr-left">
          <div className="kicker">Tell us about your situation</div>
          <div className="field-label" style={{ marginTop: 0 }}>Describe your situation</div>
          <textarea
            className="lt-text"
            style={{ minHeight: '200px', fontSize: '16px', width: '100%' }}
            spellCheck={false}
            value={intake}
            onChange={e => setIntake(e.target.value)}
          />
          <p className="tiny">Include: relationship to a U.S. citizen or green-card holder, your job situation, current immigration status, time in the U.S., and any special circumstances (asylum, military, investment).</p>
          <div className="dr-actions">
            <button className="btn btn-primary" onClick={handleFind} disabled={loading}>Find my pathway</button>
          </div>
        </div>

        <div className="dr-right">
          <div className="kicker">Suggested pathway</div>
          {loading && <LoadingSpinner label="Finding your most likely pathway…" />}
          {error && <div className="dr-summary">{error}</div>}
          {!loading && !error && !result && (
            <p className="dr-placeholder">Describe your situation on the left and select <b>Find my pathway</b>. GreenPath will suggest the most likely category and next steps. For complex cases, talk with an accredited immigration attorney.</p>
          )}
          {!loading && result && (
            <>
              <div className="dr-summary">
                <b>{result.primaryPathway || 'Pathway'}</b>
                {result.subcategory ? ` — ${result.subcategory}` : ''}
                {' · '}{CONF[result.confidence] || result.confidence || ''}
              </div>
              <div className="issue blu"><div className="idot" /><div><p>{result.reasoning}</p></div></div>
              {(result.nextSteps || []).length > 0 && (
                <>
                  <div className="dr-summary" style={{ marginTop: '16px' }}>Suggested next steps:</div>
                  {result.nextSteps.map((s, i) => (
                    <div key={i} className="issue blu"><div className="idot" /><div><p>{s}</p></div></div>
                  ))}
                </>
              )}
              {(result.alternativePathways || []).length > 0 && (
                <>
                  <div className="dr-summary" style={{ marginTop: '16px' }}>Other options to explore:</div>
                  {result.alternativePathways.map((a, i) => (
                    <div key={i} className="issue amb"><div className="idot" /><div><p>{a}</p></div></div>
                  ))}
                </>
              )}
              <div className="legal-row">
                <button className="btn-legal" onClick={() => navigate('qa')}>Ask a question about this</button>
                <small>Not legal advice. Complex cases: consult an accredited attorney.</small>
              </div>
            </>
          )}
        </div>
      </div>
      <LegalDisclaimer page={9} />
    </section>
  )
}
