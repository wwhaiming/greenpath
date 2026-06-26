import { useState, useEffect } from 'react'
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
import { setSiteLanguage } from './utils/translate.js'
import { saveLanguage, loadLanguage } from './utils/storage.js'

const PAGES = {
  home: Home,
  hero2: HowItWorks,
  guided: GuidedWalkthrough,
  progress: Progress,
  alerts: DeadlineAlerts,
  language: LanguageTools,
  review: DocumentReview,
  interview: InterviewPrep,
  pathway: PathwayFinder,
  qa: StageQA,
  bulletin: VisaBulletin,
}

export default function App() {
  const [page, setPage] = useState('home')
  const [siteLang, setSiteLang] = useState(() => loadLanguage())

  const navigate = (to) => {
    setPage(to)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSetSiteLang = (lang) => {
    setSiteLang(lang)
    saveLanguage(lang)
  }

  // Re-apply translation whenever the page or language changes. English is a
  // no-op. For non-English we translate on the next frame and then watch the
  // <main> container so async AI-rendered content gets translated as it appears
  // (a fixed timeout raced slow renders and left late content in English).
  useEffect(() => {
    if (siteLang === 'English') return
    let raf = 0, debounce = 0
    const run = () => setSiteLanguage(siteLang)
    raf = requestAnimationFrame(run)
    const main = document.querySelector('main')
    let observer
    if (main && 'MutationObserver' in window) {
      observer = new MutationObserver(() => {
        clearTimeout(debounce)
        debounce = setTimeout(run, 150)
      })
      observer.observe(main, { childList: true, subtree: true, characterData: true })
    }
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(debounce)
      if (observer) observer.disconnect()
    }
  }, [page, siteLang])

  const PageComponent = PAGES[page] ?? Home

  return (
    <>
      <div className="page-band" />
      <Header currentPage={page} navigate={navigate} siteLang={siteLang} setSiteLang={handleSetSiteLang} />
      <main>
        <PageComponent navigate={navigate} />
      </main>
      <div className="page-band" />
    </>
  )
}
