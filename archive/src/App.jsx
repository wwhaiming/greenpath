import React, { useEffect, useRef, useState } from 'react'
import { initApp } from './appLogic.js'

import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'
import HowItWorks from './pages/HowItWorks.jsx'
import GuidedWalkthrough from './pages/GuidedWalkthrough.jsx'
import Progress from './pages/Progress.jsx'
import DeadlineAlerts from './pages/DeadlineAlerts.jsx'
import LanguageTools from './pages/LanguageTools.jsx'
import DocumentReview from './pages/DocumentReview.jsx'
import InterviewPrep from './pages/InterviewPrep.jsx'
import PathwayFinder from './pages/PathwayFinder.jsx'
import StageQA from './pages/StageQA.jsx'
import VisaBulletin from './pages/VisaBulletin.jsx'
import Legal from './pages/Legal.jsx'

export default function App() {
  // currentPage mirrors the active section. The imperative show() in appLogic
  // owns the actual DOM class-toggling (identical to the original single-page
  // app); it calls back here so React state stays in sync for anything that
  // wants to read it. We do NOT re-render section markup off this state — the
  // sections are static and mutated in place by the original feature code.
  const [currentPage, setCurrentPage] = useState('home')
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    // Run after the DOM (identical structure) is mounted, exactly like the
    // original inline <script> at the end of <body>.
    initApp((id) => setCurrentPage(id))
  }, [])

  return (
    <>
      <div id="a11yAnnounce" className="sr-only" aria-live="polite" aria-atomic="true"></div>
      <div className="bg-ambient">
        <div className="bg-blob blob-1"></div>
        <div className="bg-blob blob-2"></div>
        <div className="bg-blob blob-3"></div>
      </div>
      <div className="bg-grain"></div>
      <div className="page-band"></div>

      <Header />

      <main>
        <Home />
        <HowItWorks />
        <GuidedWalkthrough />
        <Progress />
        <DeadlineAlerts />
        <LanguageTools />
        <DocumentReview />
        <InterviewPrep />
        <PathwayFinder />
        <StageQA />
        <VisaBulletin />
        <Legal />
      </main>

      <div className="page-band"></div>
    </>
  )
}
