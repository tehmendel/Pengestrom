import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { detectRecurringExpenses } from '../lib/vendorRecurrence'
import { formatKr, formatDate } from '../lib/format'

export default function RecurringExpenses() {
  const { household, user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [dismissed, setDismissed] = useState(new Set())
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [{ data: tx }, { data: dis }] = await Promise.all([
      supabase.from('transactions').select('id, date, description, amount, accounts(display_name)').eq('type', 'utgift').order('date', { ascending: false }).limit(1000),
      supabase.from('dismissed_recurring').select('vendor_key'),
    ])
    setTransactions(tx || [])
    setDismissed(new Set((dis || []).map((d) => d.vendor_key)))
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  const detected = useMemo(
    () => detectRecurringExpenses(transactions).filter((d) => !dismissed.has(d.vendorKey)),
    [transactions, dismissed]
  )

  async function dismiss(vendorKey) {
    await supabase.from('dismissed_recurring').insert({ household_id: household.id, vendor_key: vendorKey, dismissed_by: user.id })
    setDismissed((prev) => new Set(prev).add(vendorKey))
  }

  const totalMonthly = detected.reduce((sum, d) => sum + d.monthlyEstimate, 0)

  return (
    <div className="stack">
      <div className="page-title">Faste utgifter</div>
      <div className="page-sub" style={{ marginTop: -8 }}>Automatisk oppdaget fra transaksjonshistorikken din — samme leverandør, jevnlig beløp, flere måneder på rad.</div>

      {!loading && detected.length > 0 && (
        <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="icon-chip icon-chip-red">💸</span>
              <span className="stat-label">Totalt per måned</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{formatKr(totalMonthly)}</div>
          </div>
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="icon-chip icon-chip-yellow">📅</span>
              <span className="stat-label">Totalt per år</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{formatKr(totalMonthly * 12)}</div>
          </div>
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="icon-chip icon-chip-purple">🔁</span>
              <span className="stat-label">Antall</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{detected.length}</div>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Laster…</div>
        ) : detected.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔁</div>
            <div>Ingen faste utgifter oppdaget ennå — trenger minst to måneder med lignende transaksjoner fra samme leverandør.</div>
          </div>
        ) : (
          detected.map((d) => (
            <div key={d.vendorKey} className="row-between" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
              <div className="row" style={{ minWidth: 0 }}>
                <span className="icon-chip icon-chip-blue">🔁</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.displayName}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    <span className="badge badge-neutral" style={{ marginRight: 6 }}>{d.cadenceLabel}</span>
                    {d.accountName ? `${d.accountName} · ` : ''}neste ca. {formatDate(d.nextDate)}
                  </div>
                </div>
              </div>
              <div className="row">
                <div style={{ textAlign: 'right' }}>
                  <span className="amount-negative" style={{ fontWeight: 600, display: 'block' }}>−{formatKr(d.amount)}</span>
                  <span className="text-muted" style={{ fontSize: 11 }}>{formatKr(d.monthlyEstimate)}/mnd snitt</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => dismiss(d.vendorKey)}>Skjul</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
