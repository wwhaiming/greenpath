import { useState, useEffect } from 'react'
import { reviewAI } from '../utils/api.js'
import { DR_SAMPLES } from '../constants/drSamples.js'
import IssueCard from '../components/IssueCard.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'
import { saveDocumentReviewData, loadDocumentReviewData } from '../utils/storage.js'

const STATUS_TEXT = {
  'looks-good': 'No obvious issues found. This is not a guarantee — always confirm against the official USCIS form instructions.',
  'needs-attention': 'A few points to review before you file.',
  'major-issues': 'Several important issues to fix before filing.',
}

function localReview(text, formType) {
  const t = text.toLowerCase()
  const out = []
  if (/(signature|sign)\b[^.]*\b(blank|empty|left|not|missing|unsigned)/.test(t) || /\bunsigned\b/.test(t))
    out.push({ severity: 'high', field: 'Missing signature', problem: 'A required signature field appears blank — forms are often rejected if unsigned.', suggestion: '' })
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text) && /(passport|other|differ|mismatch|doesn'?t match|not match|30\/05|05\/30)/.test(t))
    out.push({ severity: 'high', field: 'Date may not match', problem: 'A date looks inconsistent across documents (e.g. MM/DD vs DD/MM). Make them identical.', suggestion: '' })
  if (/(blank|empty|left blank|not (provided|listed|entered)|no (end )?date|missing|empty)/.test(t))
    out.push({ severity: 'medium', field: 'Blank or missing field', problem: 'Something is described as blank or not listed — confirm whether the form requires it.', suggestion: '' })
  if (/(gap|overlap|no end date|present)/.test(t) && /(address|residence|employment|job|trip|abroad)/.test(t))
    out.push({ severity: 'medium', field: 'Possible timeline gap', problem: 'Check that your address or employment dates have no unexplained gaps or overlaps.', suggestion: '' })
  out.push({ severity: 'low', field: 'Check official instructions', problem: `Requirements vary by form and case — verify against the latest USCIS instructions for ${formType}.`, suggestion: '' })
  return out
}

const DEFAULT_INPUT = 'Address history: 2019–2021 (Chicago), 2022–present (Houston). Signature: left blank. Date of birth: 05/30/1996 on this form, 30/05/1996 on my passport. Employment: no end date listed for previous job.'

export default function DocumentReview({ navigate }) {
  const [formType, setFormType] = useState(() => loadDocumentReviewData().formType)
  const [inputText, setInputText] = useState(() => {
    const saved = loadDocumentReviewData()
    return saved.inputText || DEFAULT_INPUT
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [offlineNote, setOfflineNote] = useState('')

  // Debounce persistence so a full re-serialize doesn't run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => saveDocumentReviewData({ formType, inputText }), 400)
    return () => clearTimeout(t)
  }, [formType, inputText])

  async function handleReview() {
    const text = inputText.trim()
    if (!text) { setResult(null); return }
    setLoading(true); setResult(null); setOfflineNote('')
    try {
      const r = await reviewAI(formType, text)
      setResult(r)
    } catch (_) {
      const issues = localReview(text, formType)
      setResult({
        overallStatus: issues.some(i => i.severity === 'high') ? 'major-issues' : 'needs-attention',
        issues,
        reminders: [],
      })
      setOfflineNote('(Reviewed with the on-device checker; connect to the internet for the full AI review.)')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Document Review</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        AI review catches possible issues before submission.
      </h1>
      <p className="lede">Prototype demo uses synthetic entries only. Verify every form before filing.</p>

      <div className="dr-grid">
        <div className="dr-left">
          <div className="kicker">Form entry to review</div>
          <div className="field-label" style={{ marginTop: 0 }}>Which form is this?</div>
          <select className="lt-sel-real" style={{ width: '100%', marginBottom: '18px' }} value={formType} onChange={e => setFormType(e.target.value)}>
            <option value="I-485">I-485 — Adjustment of Status</option>
            <option value="I-130">I-130 — Petition for Alien Relative</option>
            <option value="I-765">I-765 — Employment Authorization</option>
            <option value="I-693">I-693 — Medical Examination</option>
            <option value="N-400">N-400 — Application for Naturalization</option>
            <option value="Other">Other / not sure</option>
          </select>
          <div className="field-label">Describe or paste your entries</div>
          <textarea
            className="lt-text"
            style={{ minHeight: '170px', fontSize: '16px', width: '100%' }}
            spellCheck={false}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
          />
          <div className="dr-actions">
            <button className="btn btn-primary" onClick={handleReview} disabled={loading}>Review with AI</button>
            <button className="btn btn-ghost" onClick={() => setInputText(DR_SAMPLES[formType] || DR_SAMPLES.Other)}>Load sample</button>
          </div>
          <p className="tiny">Use synthetic or sample text only. Do not paste real personal documents into this demo.</p>
        </div>

        <div className="dr-right">
          <div className="kicker">Possible issues to review</div>
          {loading && <LoadingSpinner label={`Reviewing your ${formType} entries…`} />}
          {!loading && !result && (
            <p className="dr-placeholder">Enter your form details on the left and select <b>Review with AI</b>. GreenPath will flag fields that commonly trigger a Request for Evidence (RFE) so you can fix them before filing.</p>
          )}
          {!loading && result && (
            <>
              <div className="dr-summary">
                {STATUS_TEXT[result.overallStatus] || result.overallStatus}
                {offlineNote && ' ' + offlineNote}
              </div>
              {result.issues.map((issue, i) => (
                <IssueCard key={i} severity={issue.severity} field={issue.field} problem={issue.problem} suggestion={issue.suggestion} />
              ))}
              {result.reminders.length > 0 && (
                <>
                  <div className="dr-summary" style={{ marginTop: '16px' }}>Before you submit:</div>
                  {result.reminders.map((r, i) => (
                    <div key={i} className="issue blu"><div className="idot" /><div><p>{r}</p></div></div>
                  ))}
                </>
              )}
            </>
          )}
          <div className="legal-row">
            <button className="btn-legal" onClick={() => navigate('interview')}>Find Authorized Legal Help</button>
            <small>AI review can miss issues.</small>
          </div>
        </div>
      </div>
      <LegalDisclaimer page={7} />
    </section>
  )
}
