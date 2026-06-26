import { useState, useRef, useEffect } from 'react'
import { IP_BANK, exampleFor } from '../constants/interviewBank.js'
import { ISO, LANG_NAMES } from '../constants/languages.js'
import { interviewAI } from '../utils/api.js'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

function localCoach(a) {
  const words = a.trim().split(/\s+/).length
  if (/\b(i don'?t know|not sure|no se|unsure)\b/i.test(a))
    return { level: 'help', note: "It's okay not to know — in a real interview you can politely ask the officer to repeat or clarify." }
  if (words < 6) return { level: 'clarify', note: 'A bit brief. Add specific details like dates, places, or names so your answer is clear.' }
  if (words > 120) return { level: 'clarify', note: 'Strong detail, but try to be more concise and answer the exact question asked.' }
  return { level: 'clear', note: "Clear and specific — that's the kind of direct answer officers look for." }
}

const COACH_LABELS = { clear: '● Clear', clarify: '● Needs clarification', help: '● Consider asking for help' }

export default function InterviewPrep() {
  const [caseType, setCaseType] = useState('')
  const [messages, setMessages] = useState([]) // {type:'officer'|'me'|'coach'|'done', content, level}
  const [transcript, setTranscript] = useState([]) // {role:'applicant'|'officer', content}
  const [active, setActive] = useState(false)
  const [typing, setTyping] = useState(false)
  const [answer, setAnswer] = useState('')
  const [lastQ, setLastQ] = useState('')
  const [qCount, setQCount] = useState(0)
  const chatRef = useRef()
  const answerRef = useRef()
  const endedRef = useRef(false) // guards end-of-session so it fires exactly once

  // Append the closing messages and deactivate. Guarded so StrictMode's double
  // invoke (or two termination sources) can't produce duplicate 'done' bubbles.
  function endSession(closingLine, summary) {
    if (endedRef.current) return
    endedRef.current = true
    addMsg({ type: 'officer', content: closingLine })
    if (summary) addMsg({ type: 'coach', level: 'clear', content: summary })
    addMsg({ type: 'done' })
    setActive(false)
  }

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, typing])

  function addMsg(msg) {
    setMessages(prev => [...prev, msg])
  }

  async function askNext(userAnswer) {
    setTyping(true)
    try {
      const r = await interviewAI(caseType, transcript, userAnswer)
      setTyping(false)
      if (userAnswer && r.coaching) {
        addMsg({ type: 'coach', level: r.coaching.level, content: r.coaching.note })
      }
      if (r.done) {
        endSession(
          r.nextQuestion || "That's the end of this practice session. Review the feedback above and try again anytime.",
          r.summary,
        )
        return
      }
      const q = r.nextQuestion || exampleFor(caseType)
      setLastQ(q)
      setTranscript(prev => [...prev, { role: 'officer', content: q }])
      addMsg({ type: 'officer', content: q })
      // Compute the new count outside the updater; the updater only sets state.
      const newCount = qCount + 1
      setQCount(newCount)
      if (newCount >= 8) {
        endSession("That's all the questions for this practice round. Review your feedback above — you can start again with another scenario anytime.")
      }
    } catch (_) {
      setTyping(false)
      if (userAnswer) {
        const c = localCoach(userAnswer)
        addMsg({ type: 'coach', level: c.level, content: c.note })
      }
      const bank = IP_BANK[caseType] || IP_BANK['Marriage-based adjustment of status (I-485)']
      if (qCount >= bank.length) {
        endSession('That completes this practice round. Review your feedback above — start again anytime.')
        return
      }
      const q = bank[qCount]
      setLastQ(q)
      addMsg({ type: 'officer', content: q })
      setQCount(qCount + 1)
    }
  }

  async function handleStart() {
    if (!caseType) return
    setMessages([])
    setTranscript([])
    setQCount(0)
    setLastQ('')
    setActive(true)
    endedRef.current = false
    addMsg({
      type: 'officer',
      caseType,
      pre: 'Hello, and thank you for coming in today. This is a practice interview for your ',
      post: ". Answer naturally — I'll give you feedback after each response. Let's begin.",
    })
    await askNext('')
  }

  async function handleSend() {
    const a = answer.trim()
    if (!a || !active) return
    addMsg({ type: 'me', content: a })
    setTranscript(prev => [...prev, { role: 'applicant', content: a }])
    setAnswer('')
    if (answerRef.current) { answerRef.current.style.height = 'auto' }
    await askNext(a)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleReadQ() {
    if (!('speechSynthesis' in window)) return
    const q = lastQ || exampleFor(caseType)
    if (!q) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(q); u.rate = 0.95
    window.speechSynthesis.speak(u)
  }

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Interview Prep</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        Practice replaces uncertainty with preparation.
      </h1>
      <p className="lede">A calm simulator helps users rehearse questions and notice what needs clarification.</p>

      <div className="ip-grid">
        <div className="ip-left">
          <div className="kicker">Practice session</div>
          <div className="field-label">Case type</div>
          <select className="lt-sel-real" style={{ width: '100%' }} value={caseType} onChange={e => setCaseType(e.target.value)}>
            <option value="">Select a practice scenario</option>
            <option value="Marriage-based adjustment of status (I-485)">Marriage-based green card (I-485)</option>
            <option value="Family-based petition (I-130)">Family-based petition (I-130)</option>
            <option value="Employment-based green card">Employment-based green card</option>
            <option value="Naturalization / citizenship (N-400)">Citizenship interview (N-400)</option>
            <option value="Asylum interview">Asylum interview</option>
          </select>
          <div className="example-q">
            <small>Example question</small>
            <b>{caseType ? exampleFor(caseType) : 'Please explain your current address history.'}</b>
          </div>
          <div className="ip-btns">
            <button className="btn btn-primary" onClick={handleStart} disabled={!caseType}>● Start Practice</button>
            <button className="btn-read" onClick={handleReadQ}>▶ Read Question</button>
          </div>
          <p className="tiny" style={{ marginTop: '14px' }}>A calm simulation only. Real interviews vary — never treat this as legal advice.</p>
        </div>

        <div className="ip-chat-wrap">
          <div className="ip-chat" ref={chatRef}>
            {messages.length === 0 && (
              <div className="ip-empty">
                <div className="ip-empty-icon">🎙️</div>
                <p>Pick a case type and press <b>Start Practice</b>. An AI interviewer will ask one USCIS-style question at a time, then give you coaching feedback on each answer.</p>
              </div>
            )}
            {messages.map((msg, i) => {
              if (msg.type === 'officer') return (
                <div key={i} className="bubble officer">
                  <span className="who">Interviewer</span>
                  {msg.caseType
                    ? <span>{msg.pre}<b>{msg.caseType}</b>{msg.post}</span>
                    : <span>{msg.content}</span>}
                </div>
              )
              if (msg.type === 'me') return (
                <div key={i} className="bubble me">{msg.content}</div>
              )
              if (msg.type === 'coach') return (
                <div key={i} className={`coach-card ${msg.level}`}>
                  <div className="ctag">{COACH_LABELS[msg.level] || msg.level}</div>
                  <p>{msg.content}</p>
                </div>
              )
              if (msg.type === 'done') return (
                <div key={i} className="ip-done">Practice session complete.</div>
              )
              return null
            })}
            {typing && (
              <div className="ip-typing">
                Interviewer is typing <i /><i /><i />
              </div>
            )}
          </div>
          {active && (
            <div className="ip-input">
              <textarea
                ref={answerRef}
                value={answer}
                onChange={e => {
                  setAnswer(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer…"
                rows={1}
              />
              <button className="btn btn-primary" onClick={handleSend}>Send</button>
            </div>
          )}
        </div>
      </div>
      <LegalDisclaimer page={8} />
    </section>
  )
}
