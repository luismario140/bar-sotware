interface StatusCardProps {
  title: string
  value: string
  description: string
  ready: boolean
}

export function StatusCard({ title, value, description, ready }: StatusCardProps) {
  return (
    <article className="status-card">
      <p className="card-title">{title}</p>
      <h2><span className={`status-dot ${ready ? 'ready' : ''}`} />{value}</h2>
      <p>{description}</p>
    </article>
  )
}
