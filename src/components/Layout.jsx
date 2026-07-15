import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { HomeIcon, ListIcon, WalletIcon, UploadIcon, GearIcon, TagIcon, LogoutIcon, CoinsIcon, TrendingUpIcon, RepeatIcon, ReceiptIcon, StoreIcon, ChevronRightIcon } from './icons'
import { APP_VERSION } from '../version'

const topLinks = [
  { to: '/', label: 'Oversikt', end: true, Icon: HomeIcon },
  { to: '/formue', label: 'Formue', Icon: CoinsIcon },
  { to: '/investeringer', label: 'Investeringer', Icon: TrendingUpIcon },
  { to: '/skatt', label: 'Skatt', Icon: ReceiptIcon },
]

const transactionsGroup = {
  to: '/transaksjoner',
  label: 'Transaksjoner',
  Icon: ListIcon,
  children: [
    { to: '/faste-utgifter', label: 'Faste utgifter', Icon: RepeatIcon },
    { to: '/kategorier', label: 'Kategorier', Icon: TagIcon },
    { to: '/leverandorer', label: 'Leverandører', Icon: StoreIcon },
    { to: '/importer', label: 'Importer', Icon: UploadIcon },
  ],
}

const bottomLinks = [
  { to: '/kontoer', label: 'Kontoer', Icon: WalletIcon },
  { to: '/innstillinger', label: 'Innstillinger', Icon: GearIcon },
]

const tabLinks = [
  { to: '/', label: 'Oversikt', end: true, Icon: HomeIcon },
  { to: '/transaksjoner', label: 'Transaksjoner', Icon: ListIcon },
  { to: '/kontoer', label: 'Kontoer', Icon: WalletIcon },
  { to: '/importer', label: 'Importer', Icon: UploadIcon },
  { to: '/innstillinger', label: 'Innstillinger', Icon: GearIcon },
]

export default function Layout() {
  const { profile, household, signOut } = useAuth()
  const location = useLocation()
  const childPaths = transactionsGroup.children.map((c) => c.to)
  const groupActive = location.pathname === transactionsGroup.to || childPaths.includes(location.pathname)
  const [open, setOpen] = useState(groupActive)

  useEffect(() => { if (groupActive) setOpen(true) }, [groupActive])

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="row" style={{ marginBottom: 'var(--space-5)', padding: '0 var(--space-1)' }}>
          <Avatar src={household?.avatarUrl} name={household?.name} size="avatar-sm" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {household?.name}
            </div>
          </div>
        </div>

        {topLinks.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <l.Icon width={18} height={18} />
            {l.label}
          </NavLink>
        ))}

        <div className="nav-divider" />

        <div className="nav-group">
          <NavLink to={transactionsGroup.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <transactionsGroup.Icon width={18} height={18} />
            {transactionsGroup.label}
          </NavLink>
          <button
            type="button"
            className={`nav-group-toggle${open ? ' open' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Skjul undermeny' : 'Vis undermeny'}
          >
            <ChevronRightIcon width={16} height={16} />
          </button>
        </div>
        {open && (
          <div className="nav-sublist">
            {transactionsGroup.children.map((c) => (
              <NavLink key={c.to} to={c.to} className={({ isActive }) => `nav-sublink${isActive ? ' active' : ''}`}>
                {c.label}
              </NavLink>
            ))}
          </div>
        )}

        {bottomLinks.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <l.Icon width={18} height={18} />
            {l.label}
          </NavLink>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <div className="row" style={{ padding: '0 var(--space-1)', marginBottom: 'var(--space-2)' }}>
            <Avatar name={profile?.full_name} size="avatar-sm" />
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.full_name}
            </div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={signOut}>
            <LogoutIcon width={16} height={16} />
            Logg ut
          </button>
          <div className="text-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 'var(--space-2)' }}>v{APP_VERSION}</div>
        </div>
      </nav>

      <main className="app-main">
        {groupActive && (
          <nav className="mobile-subnav">
            <NavLink to={transactionsGroup.to} end className={({ isActive }) => `chip${isActive ? ' active' : ''}`}>
              {transactionsGroup.label}
            </NavLink>
            {transactionsGroup.children.map((c) => (
              <NavLink key={c.to} to={c.to} className={({ isActive }) => `chip${isActive ? ' active' : ''}`}>
                {c.label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="page">
          <Outlet />
        </div>
      </main>

      <nav className="tab-bar">
        {tabLinks.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `tab-link${isActive ? ' active' : ''}`}>
            <l.Icon width={22} height={22} />
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
