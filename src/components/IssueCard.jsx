const SEV_CLASS = { high: 'red', medium: 'amb', low: 'blu' }

export default function IssueCard({ severity = 'low', field, problem, suggestion }) {
  const cls = SEV_CLASS[severity] || 'blu'
  return (
    <div className={`issue ${cls}`}>
      <div className="idot" />
      <div>
        {field && <b>{field}</b>}
        <p>
          {problem}
          {suggestion && <> <i>Fix: {suggestion}</i></>}
        </p>
      </div>
    </div>
  )
}
