import { useState, useEffect, useRef } from 'react'
import { STEPS } from '../constants/quizSteps.js'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

async function fetchHint(label, question, answer) {
  const res = await fetch('/api/intake-hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, question, answer }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.hint
}

async function fetchPathway(answers) {
  const intake = STEPS.map((s, i) => `${s.label}: ${answers[i]}`).join('\n')
  const res = await fetch('/api/pathway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intake }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

async function askQuestion(question, stepContext, answers) {
  const context = STEPS.map((s, i) => answers[i] ? `${s.label}: ${answers[i]}` : null)
    .filter(Boolean).join('; ')
  const systemMsg = `You are GreenPath's immigration intake assistant. The user is filling out a step-by-step intake quiz to find their U.S. immigration pathway. Answer questions about the quiz step or their immigration situation in plain English. No legal advice. Be concise (2–3 sentences max).`
  const userMsg = `Current step: "${stepContext}"\nAnswers so far: ${context || 'none yet'}\n\nUser question: ${question}`
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 200,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
    }),
  })
  if (!res.ok) throw new Error('api ' + res.status)
  const data = await res.json()
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
}

export default function GuidedWalkthrough({ navigate }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState(Array(6).fill(''))
  const [done, setDone] = useState(false)
  const [result, setResult] = useState(null)
  const [resultLoading, setResultLoading] = useState(false)

  const [hint, setHint] = useState('')
  const [hintLoading, setHintLoading] = useState(true)

  const [chat, setChat] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  const s = STEPS[step]
  const progress = ((step + 1) / 6) * 100

  useEffect(() => {
    setHint('')
    setHintLoading(true)
    setChat([])
    fetchHint(s.label, s.q, answers[step])
      .then(h => { setHint(h); setHintLoading(false) })
      .catch(() => { setHint(s.tip); setHintLoading(false) })
  }, [step])

  useEffect(() => {
    if (!answers[step]) return
    setHintLoading(true)
    fetchHint(s.label, s.q, answers[step])
      .then(h => { setHint(h); setHintLoading(false) })
      .catch(() => { setHint(s.tip); setHintLoading(false) })
  }, [answers[step]])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

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
      setResultLoading(true)
      fetchPathway(answers)
        .then(data => {
          setResult(data)
          setResultLoading(false)
          setDone(true)
        })
        .catch(() => {
          setResult({ primaryPathway: "Let's explore options together", reasoning: "Your answers don't point to one clear pathway yet. GreenPath would ask a few more questions and, where helpful, suggest authorized organizations that can review your case.", nextSteps: [] })
          setResultLoading(false)
          setDone(true)
        })
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
    setChat([])
    setChatInput('')
  }

  async function handleAsk(e) {
    e.preventDefault()
    const q = chatInput.trim()
    if (!q || chatLoading) return
    setChatInput('')
    setChat(prev => [...prev, { role: 'user', text: q }])
    setChatLoading(true)
    try {
      const answer = await askQuestion(q, s.q, answers)
      setChat(prev => [...prev, { role: 'ai', text: answer }])
    } catch {
      setChat(prev => [...prev, { role: 'ai', text: 'Unable to reach the AI assistant right now. Try again.' }])
    }
    setChatLoading(false)
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
            {resultLoading ? (
              <div style={{ color: 'var(--muted)', fontSize: '15px', padding: '32px 0' }}>Analyzing your answers…</div>
            ) : (
              <>
                <div className="qlabel" style={{ color: 'var(--green-mid)' }}>YOUR POSSIBLE PATHWAY</div>
                <div className="qbar"><i style={{ width: '100%' }} /></div>
                <h2>{result.primaryPathway}</h2>
                {result.subcategory && (
                  <p style={{ color: 'var(--green-mid)', fontSize: '14px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{result.subcategory}</p>
                )}
                <p style={{ color: 'var(--muted)', fontSize: '16px', marginBottom: '8px' }}>{result.reasoning}</p>
                {result.nextSteps && result.nextSteps.length > 0 && (
                  <div style={{ margin: '16px 0' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--green-mid)', marginBottom: '8px' }}>Next steps</div>
                    <ol style={{ margin: 0, paddingLeft: '18px', color: 'var(--muted)', fontSize: '15px', lineHeight: 1.7 }}>
                      {result.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}
                <div className="ai-assist" style={{ margin: '18px 0' }}>
                  <b>Important</b>
                  <p>This is general information based on your answers — not a legal determination. Complex situations should be reviewed with an authorized immigration attorney.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => navigate('progress')}>See My Roadmap</button>
                  <button className="btn btn-ghost" onClick={handleRestart}>Start Over</button>
                </div>
              </>
            )}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="ai-assist" style={{ flex: 1 }}>
                  <b>AI Assistance</b>
                  {hintLoading ? (
                    <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '14px' }}>Thinking…</p>
                  ) : (
                    <p>{hint}</p>
                  )}

                  {/* Chat Q&A */}
                  {chat.length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                      {chat.map((msg, i) => (
                        <div key={i} style={{
                          fontSize: '13px',
                          lineHeight: 1.5,
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: msg.role === 'user' ? 'var(--cream-dark, #e8e4d9)' : 'rgba(255,255,255,0.6)',
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '90%',
                          color: 'var(--ink)',
                        }}>
                          {msg.text}
                        </div>
                      ))}
                      {chatLoading && (
                        <div style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--muted)', padding: '4px 10px' }}>Thinking…</div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}

                  {/* Ask input */}
                  <form onSubmit={handleAsk} style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Ask a question…"
                      disabled={chatLoading}
                      style={{
                        flex: 1,
                        fontSize: '13px',
                        padding: '6px 10px',
                        border: '1px solid var(--border, #d4cebc)',
                        borderRadius: '20px',
                        background: 'white',
                        outline: 'none',
                        color: 'var(--ink)',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || chatLoading}
                      style={{
                        padding: '6px 14px',
                        fontSize: '13px',
                        borderRadius: '20px',
                        background: 'var(--green-dark)',
                        color: 'white',
                        border: 'none',
                        cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed',
                        opacity: chatInput.trim() && !chatLoading ? 1 : 0.5,
                      }}
                    >
                      Ask
                    </button>
                  </form>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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
