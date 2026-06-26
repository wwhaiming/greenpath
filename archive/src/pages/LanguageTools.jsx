import { useState, useRef } from 'react'
import { ISO, speechCode, LANG_NAMES } from '../constants/languages.js'
import { translateAI, translateFree, detectLang } from '../utils/translate.js'
import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

const LANG_OPTIONS = Object.keys(ISO).sort()

export default function LanguageTools() {
  const [fromLang, setFromLang] = useState('Spanish')
  const [toLang, setToLang] = useState('English')
  const [sourceText, setSourceText] = useState('Necesito ayuda para entender qué documentos debo reunir para mi próximo paso.')
  const [outputText, setOutputText] = useState('I need help understanding which documents I should gather for my next step.')
  const [status, setStatus] = useState('')
  const [fontSize, setFontSize] = useState('21')
  const [speed, setSpeed] = useState('1')
  const [speaking, setSpeaking] = useState(false)
  const [translating, setTranslating] = useState(false)
  const fileRef = useRef()

  async function handleTranslate() {
    const text = sourceText.trim()
    if (!text) { setStatus('Type something to translate.'); return }
    if (fromLang !== 'auto' && fromLang === toLang) {
      setOutputText(text); setStatus('Source and target are the same language.'); return
    }
    setStatus('Translating…'); setTranslating(true)
    try {
      const out = await translateAI(text, fromLang, toLang)
      if (out) { setOutputText(out); setStatus('Translated to ' + toLang + '.'); return }
    } catch (_) { /* fall through */ }
    try {
      const out = await translateFree(text, fromLang, toLang)
      if (out) { setOutputText(out); setStatus('Translated to ' + toLang + '.'); return }
      throw new Error('empty')
    } catch (_) {
      setOutputText(''); setStatus('Translation service is unreachable right now — check your connection and try again.')
    } finally {
      setTranslating(false)
    }
  }

  function handleSwap() {
    const f = fromLang === 'auto' ? 'English' : fromLang
    setFromLang(toLang); setToLang(f)
    setSourceText(outputText); setOutputText(sourceText)
  }

  function handleDetect() {
    const t = sourceText.trim()
    if (!t) { setStatus('Type some text first.'); return }
    const guess = detectLang(t)
    if (guess && LANG_OPTIONS.includes(guess)) { setFromLang(guess); setStatus('Detected: ' + guess + '.') }
    else setStatus('Could not confidently detect — please choose the source language.')
  }

  function handleRead() {
    if (!('speechSynthesis' in window)) { setStatus('Read-aloud not supported in this browser.'); return }
    if (speaking) { window.speechSynthesis.cancel(); return }
    const text = outputText.trim()
    if (!text) { setStatus('Nothing to read yet — translate first.'); return }
    const u = new SpeechSynthesisUtterance(text)
    u.rate = parseFloat(speed)
    u.lang = speechCode(toLang)
    u.onstart = () => setSpeaking(true)
    u.onend = u.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  function setScanned(text, name) {
    text = (text || '').trim()
    if (!text) { setStatus('No readable text found in ' + name + '.'); return }
    setSourceText(text.slice(0, 5000))
    setFromLang('auto')
    setStatus('Scanned text from ' + name + '. Press Translate.')
  }

  async function ocrImage(file) {
    if (!window.Tesseract) throw new Error('OCR library not loaded — check your connection')
    setStatus('Scanning image… 0%')
    const url = URL.createObjectURL(file)
    try {
      const { data } = await window.Tesseract.recognize(url, 'eng+spa+fra+por+deu+ita', {
        logger: m => { if (m.status === 'recognizing text') setStatus('Scanning image… ' + Math.round(m.progress * 100) + '%') },
      })
      return data.text
    } finally { URL.revokeObjectURL(url) }
  }

  async function readPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF library not loaded — check your connection')
    if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    const buf = await file.arrayBuffer()
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise
    let out = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      setStatus('Reading PDF page ' + p + ' of ' + pdf.numPages + '…')
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      out += tc.items.map(i => i.str).join(' ') + '\n'
    }
    if (out.trim().length > 15) return out
    setStatus('Scanned PDF detected — running OCR…')
    let ocr = ''
    const pages = Math.min(pdf.numPages, 3)
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p)
      const vp = page.getViewport({ scale: 2 })
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'))
      const { data } = await window.Tesseract.recognize(blob, 'eng+spa+fra', {
        logger: m => { if (m.status === 'recognizing text') setStatus('OCR page ' + p + '/' + pages + '… ' + Math.round(m.progress * 100) + '%') },
      })
      ocr += data.text + '\n'
    }
    return ocr
  }

  async function handleScan() {
    const f = fileRef.current.files[0]; if (!f) return
    try {
      if (f.type === 'text/plain') {
        setScanned(await f.text(), f.name)
      } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        setScanned(await readPdf(f), f.name)
      } else if (f.type.startsWith('image/')) {
        setScanned(await ocrImage(f), f.name)
      } else {
        setStatus('Unsupported file type. Use an image, PDF, or .txt file.')
      }
    } catch (err) {
      setStatus('Could not read that file: ' + (err?.message ?? 'unknown error') + '.')
    } finally {
      fileRef.current.value = ''
    }
  }

  const textStyle = { fontSize: fontSize + 'px' }

  return (
    <section>
      <div className="kicker-rule" />
      <div className="kicker">Multilingual Support</div>
      <h1 className="h1" style={{ fontSize: 'clamp(36px,4.6vw,58px)', marginTop: '8px' }}>
        Support works in the language and format the user needs.
      </h1>
      <p className="lede">Translate text, scan a page, or hear instructions read aloud.</p>

      <div className="lt-toolbar">
        <select className="lt-sel-real" value={fromLang} onChange={e => setFromLang(e.target.value)}>
          <option value="auto">Detect language</option>
          {LANG_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="lt-arrow" onClick={handleSwap} title="Swap languages">⇄</button>
        <select className="lt-sel-real" value={toLang} onChange={e => setToLang(e.target.value)}>
          {LANG_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <select className="lt-sel-real" value={speed} onChange={e => setSpeed(e.target.value)}>
          <option value="0.75">Speed: 0.75×</option>
          <option value="1">Speed: 1.0×</option>
          <option value="1.25">Speed: 1.25×</option>
          <option value="1.5">Speed: 1.5×</option>
        </select>
        <select className="lt-sel-real" value={fontSize} onChange={e => setFontSize(e.target.value)}>
          <option value="17">Text size: Small</option>
          <option value="21">Text size: Medium</option>
          <option value="26">Text size: Large</option>
        </select>
      </div>

      <div className="lt-body">
        <div className="lt-cols">
          <div>
            <h5>Source text</h5>
            <textarea className="lt-text" style={textStyle} value={sourceText} onChange={e => setSourceText(e.target.value)} spellCheck={false} />
          </div>
          <div>
            <h5>Translation</h5>
            <div className="lt-text out" style={textStyle}>{outputText}</div>
          </div>
        </div>
        <div className="lt-cols" style={{ marginTop: '22px' }}>
          <div className="lt-actions">
            <button className="btn-scan" onClick={() => fileRef.current.click()}>📄 Scan Document</button>
            <button className="btn btn-primary" onClick={handleTranslate} disabled={translating} style={{ padding: '15px 30px' }}>Translate</button>
            <small>{status}</small>
          </div>
          <div className="lt-actions">
            <button className={`btn-read${speaking ? ' speaking' : ''}`} onClick={handleRead}>
              {speaking ? '■ Stop' : '▶ Read Aloud'}
            </button>
            <button className="btn-detect" onClick={handleDetect}>AUTO-DETECT LANGUAGE</button>
            <small>Translation tools</small>
          </div>
        </div>
        <input type="file" ref={fileRef} accept="image/*,.pdf,.txt" style={{ display: 'none' }} onChange={handleScan} />
      </div>
      <LegalDisclaimer page={6} />
    </section>
  )
}
