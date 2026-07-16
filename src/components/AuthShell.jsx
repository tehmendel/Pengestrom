import { Logo } from './Logo'

export default function AuthShell({ title, subtitle, children, wide }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: 'var(--space-4)',
      }}
    >
      <div className="card card-pad" style={{ width: '100%', maxWidth: wide ? 440 : 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
          <Logo size={48} style={{ margin: '0 auto var(--space-3)', display: 'block' }} />
          <div style={{ fontWeight: 700, fontSize: 20 }}>{title}</div>
          {subtitle && <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}
