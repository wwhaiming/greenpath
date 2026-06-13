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

  // Re-apply translation whenever the page or language changes
  useEffect(() => {
    if (siteLang !== 'English') {
      // Small delay lets React finish rendering before the DOM walker runs
      const t = setTimeout(() => setSiteLanguage(siteLang), 80)
      return () => clearTimeout(t)
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
