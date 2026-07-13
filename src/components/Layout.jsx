import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/', label: 'Oversikt', end: true },
  { to: '/transaksjoner', label: 'Transaksjoner' },
  { to: '/kontoer', label: 'Kontoer' },
  { to: '/kategorier', label: 'Kategorier' },
  { to: '/importer', label: 'Importer' },
  { to: '/innstillinger', label: 'Innstillinger' },
]

export default function Layout() {
  const { profile, household, signOut } = useAuth()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 200, borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Økonomiportalen</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{household?.name}</div>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            style={({ isActive }) => ({
              padding: '8px 10px',
              borderRadius: 6,
              textDecoration: 'none',
              color: isActive ? '#fff' : 'var(--text)',
              background: isActive ? 'var(--accent)' : 'transparent',
              fontSize: 14,
            })}
          >
            {l.label}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          <div>{profile?.full_name}</div>
          <button className="btn" style={{ marginTop: 8, width: '100%' }} onClick={signOut}>
            Logg ut
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        <Outlet />
      </main>
    </div>
  )
}
