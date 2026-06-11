import { useState } from 'react'
import { LANG_NAMES } from '../constants/languages.js'

const NAV = [
  { id: 'home',      label: 'Home' },
  { id: 'guided',    label: 'Guided Walkthrough' },
  { id: 'progress',  label: 'Progress' },
  { id: 'alerts',    label: 'Deadline Alerts' },
  { id: 'language',  label: 'Language Tools' },
  { id: 'pathway',   label: 'Pathway Finder' },
  { id: 'qa',        label: 'Stage Q&A' },
  { id: 'bulletin',  label: 'Visa Bulletin' },
  { id: 'review',    label: 'Document Review' },
  { id: 'interview', label: 'Interview Prep' },
]

export default function Header({ currentPage, navigate, siteLang, setSiteLang }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header>
      <div className="nav-inner">
        <div className="brand">
          <span className="logo">GreenPath</span>
          <span className="tag">AI NAVIGATOR</span>
        </div>
        <button className="menu-btn" onClick={() => setMenuOpen(o => !o)}>Menu</button>
        <nav className={`main${menuOpen ? ' open' : ''}`}>
          {NAV.map(({ id, label }) => (
            <a
              key={id}
              className={currentPage === id || (currentPage === 'hero2' && id === 'home') ? 'active' : ''}
              onClick={e => { e.preventDefault(); navigate(id); setMenuOpen(false) }}
            >
              {label}
            </a>
          ))}
        </nav>
        <select
          className="lang"
          value={siteLang}
          onChange={e => setSiteLang(e.target.value)}
          aria-label="Site language"
        >
          {LANG_NAMES.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
    </header>
  )
}
