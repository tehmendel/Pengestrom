import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../lib/format'
import { BellIcon } from './icons'

export default function NotificationBell() {
  const { household } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const containerRef = useRef(null)

  async function load() {
    if (!household?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }

  useEffect(() => { load() }, [household?.id])

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const unread = notifications.filter((n) => !n.read_at)

  async function togglePanel() {
    const next = !open
    setOpen(next)
    if (next) load()
    if (next && unread.length > 0) {
      const ids = unread.map((n) => n.id)
      const now = new Date().toISOString()
      await supabase.from('notifications').update({ read_at: now }).in('id', ids)
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)))
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={containerRef}>
      <button className="btn btn-ghost btn-icon-sm" style={{ position: 'relative' }} onClick={togglePanel} aria-label="Varsler">
        <BellIcon width={18} height={18} />
        {unread.length > 0 && <span className="notification-dot">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>

      {open && (
        <div className="select-pop-menu" style={{ position: 'absolute', bottom: '110%', left: 0, width: 320, maxHeight: 380 }}>
          <div style={{ padding: 'var(--space-3)', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Varsler</div>
          {notifications.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-4)' }}>
              <div className="empty-state-icon">🔔</div>
              <div style={{ fontSize: 13 }}>Ingen varsler ennå.</div>
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {formatDateTime(n.created_at)} · {n.source === 'cron' ? 'Automatisk' : 'Manuell'}
                    </div>
                  </div>
                  {!n.read_at && <span className="badge badge-red" style={{ fontSize: 10, flexShrink: 0 }}>Ny</span>}
                </div>
                {Array.isArray(n.detail?.items) && n.detail.items.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 4, height: 'auto', minHeight: 0, padding: '2px 0', fontSize: 11 }}
                    onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                  >
                    {expandedId === n.id ? 'Skjul detaljer' : 'Vis detaljer'}
                  </button>
                )}
                {expandedId === n.id && Array.isArray(n.detail?.items) && (
                  <div style={{ marginTop: 6, background: 'var(--surface-3)', borderRadius: 6, padding: 8 }}>
                    {n.detail.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 11, marginBottom: i < n.detail.items.length - 1 ? 6 : 0 }}>
                        <div style={{ fontWeight: 600 }}>
                          {item.name}{item.isin ? <span className="text-muted"> ({item.isin})</span> : null}
                        </div>
                        <div className="text-muted">{item.error}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
