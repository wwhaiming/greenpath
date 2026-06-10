export default function LegalDisclaimer({ page }) {
  return (
    <div className="footer-rule">
      <span>General information only. GreenPath does not provide legal advice.</span>
      <span className="pg">{String(page).padStart(2, '0')}</span>
    </div>
  )
}
