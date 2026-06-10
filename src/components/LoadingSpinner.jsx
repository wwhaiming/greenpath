export default function LoadingSpinner({ label = 'Loading…' }) {
  return (
    <div className="dr-loading">
      <div className="dr-spin" />
      {label}
    </div>
  )
}
