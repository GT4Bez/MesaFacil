export default function StatCard({ label, value, hint, valueClassName }) {
  return (
    <div className="stat-card">
      <small>{label}</small>
      <strong className={valueClassName}>{value}</strong>
      <span>{hint}</span>
    </div>
  )
}
