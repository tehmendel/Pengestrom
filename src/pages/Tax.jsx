export default function Tax() {
  return (
    <div className="stack">
      <div className="page-title">Skatt</div>
      <div className="card card-pad" style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
        <div style={{ fontSize: 32, marginBottom: 'var(--space-3)' }}>🧾</div>
        <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Skattemelding håndteres hos Skatteetaten</div>
        <div className="text-secondary" style={{ fontSize: 13, maxWidth: 420, margin: '0 auto var(--space-4)' }}>
          Pengestrøm gir ikke skatteberegning eller skatterådgivning — det er et regelverksområde vi bevisst
          holder oss unna. Bruk skatteetaten.no for skattemelding, fradrag og skatteberegning.
        </div>
        <a className="btn btn-primary" href="https://www.skatteetaten.no" target="_blank" rel="noopener noreferrer">
          Gå til skatteetaten.no ↗
        </a>
      </div>
    </div>
  )
}
