import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr } from '../lib/format'

const COLORS = ['#3987e5', '#199e70', '#c98500', '#9085e9', '#d95926']

const LABELS = {
  bank: 'Bankinnskudd',
  investment: 'Verdipapirer',
  property: 'Bolig',
  vehicle: 'Kjøretøy',
  pension: 'Pensjon',
  other_asset: 'Annen eiendel',
}

const POSITIVE_CATEGORIES = ['bank', 'investment', 'property', 'vehicle', 'pension', 'other_asset']

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// Finds the snapshot closest to (but not after) the cutoff date, so a delta
// can still be shown even if no snapshot exists on the exact day.
function snapshotNear(snapshots, cutoffDate) {
  let best = null
  for (const s of snapshots) {
    if (s.snapshot_date <= cutoffDate && (!best || s.snapshot_date > best.snapshot_date)) best = s
  }
  return best
}

function DeltaBadge({ label, current, past }) {
  if (past == null) return null
  const delta = current - past
  const pct = past !== 0 ? (delta / Math.abs(past)) * 100 : 0
  const positive = delta >= 0
  return (
    <div className={`badge ${positive ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 12 }}>
      {positive ? '↗' : '↘'} {positive ? '+' : '−'}{formatKr(Math.abs(delta))} ({positive ? '+' : '−'}{Math.abs(pct).toFixed(1)}%) {label}
    </div>
  )
}

export default function Wealth() {
  const { household } = useAuth()
  const [rows, setRows] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [cashFlow, setCashFlow] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!household?.id) return
    setLoading(true)

    async function run() {
      // Best-effort: refresh today's snapshot so history builds up over time.
      await supabase.rpc('record_net_worth_snapshot', { p_household_id: household.id })

      const [{ data: netWorthRows }, { data: snaps }, { data: tx }] = await Promise.all([
        supabase.rpc('household_net_worth', { p_household_id: household.id }),
        supabase.from('net_worth_snapshots').select('snapshot_date, net_worth').eq('household_id', household.id).order('snapshot_date', { ascending: true }),
        supabase.from('transactions').select('amount, type').gte('date', `${new Date().toISOString().slice(0, 7)}-01`),
      ])

      setRows(netWorthRows || [])
      setSnapshots(snaps || [])
      const inntekt = (tx || []).filter((t) => t.type === 'inntekt').reduce((sum, t) => sum + Number(t.amount), 0)
      const utgift = (tx || []).filter((t) => t.type === 'utgift').reduce((sum, t) => sum + Number(t.amount), 0)
      setCashFlow(inntekt - utgift)
      setLoading(false)
    }

    run()
  }, [household?.id])

  const byCategory = Object.fromEntries(rows.map((r) => [r.category, Number(r.total_amount)]))
  const bank = byCategory.bank || 0
  const investment = byCategory.investment || 0
  const property = byCategory.property || 0
  const vehicle = byCategory.vehicle || 0
  const pension = byCategory.pension || 0
  const otherAsset = byCategory.other_asset || 0
  const loan = byCategory.loan || 0
  const otherDebt = byCategory.other_debt || 0
  const debt = loan + otherDebt

  const netWorth = rows.reduce((sum, r) => sum + Number(r.total_amount), 0)
  const positiveTotal = bank + investment + property + vehicle + pension + otherAsset

  const distribution = POSITIVE_CATEGORIES
    .map((cat, i) => ({ key: cat, label: LABELS[cat], value: byCategory[cat] || 0, color: COLORS[i] }))
    .filter((d) => d.value > 0)

  const monthAgoSnap = snapshotNear(snapshots, daysAgo(28))
  const yearAgoSnap = snapshotNear(snapshots, daysAgo(365))

  const statCards = [
    { label: 'Bankinnskudd', value: bank, icon: '💰', chip: 'icon-chip-blue' },
    { label: 'Verdipapirer', value: investment, icon: '📈', chip: 'icon-chip-green' },
    { label: 'Bolig', value: property, icon: '🏠', chip: 'icon-chip-purple' },
    { label: 'Gjeld', value: -debt, icon: '🏦', chip: 'icon-chip-red' },
    { label: 'Pensjon/annet', value: pension + vehicle + otherAsset, icon: '📦', chip: 'icon-chip-yellow' },
    { label: 'Mnd. kontantstrøm', value: cashFlow, icon: '💸', chip: cashFlow >= 0 ? 'icon-chip-green' : 'icon-chip-red' },
  ]

  return (
    <div className="stack">
      <div className="page-title">Formue</div>

      {loading ? (
        <div className="card card-pad empty-state">Laster…</div>
      ) : (
        <>
          <div className="card card-pad" style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
            <div className="stat-label">Din totale formue</div>
            <div style={{ fontWeight: 700, fontSize: 40, marginTop: 'var(--space-2)' }}>
              {formatKr(netWorth)}
            </div>
            <div className="row flex-wrap" style={{ justifyContent: 'center', marginTop: 'var(--space-3)' }}>
              <DeltaBadge label="denne mnd" current={netWorth} past={monthAgoSnap?.net_worth} />
              <DeltaBadge label="siste 12 mnd" current={netWorth} past={yearAgoSnap?.net_worth} />
            </div>
            {!monthAgoSnap && (
              <div className="text-muted" style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>
                Historikk bygges opp etter hvert som du besøker siden — kom tilbake om noen dager for å se utvikling.
              </div>
            )}
          </div>

          <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {statCards.map((s) => (
              <div key={s.label} className="card card-pad">
                <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
                  <span className={`icon-chip ${s.chip}`}>{s.icon}</span>
                  <span className="stat-label">{s.label}</span>
                </div>
                <div className={s.value < 0 ? 'amount-negative' : ''} style={{ fontSize: 20, fontWeight: 600 }}>
                  {s.value < 0 ? '−' : ''}{formatKr(Math.abs(s.value))}
                </div>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="section-title">Formuefordeling</div>
            {distribution.length === 0 ? (
              <div className="empty-state">Registrer kontosaldo eller eiendeler under «Kontoer» for å se fordelingen.</div>
            ) : (
              <>
                <div className="row" style={{ height: 16, borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 'var(--space-3)', gap: 0 }}>
                  {distribution.map((d) => (
                    <div key={d.key} style={{ width: `${(d.value / positiveTotal) * 100}%`, background: d.color, height: '100%' }} title={d.label} />
                  ))}
                </div>
                <div className="row flex-wrap">
                  {distribution.map((d) => (
                    <div key={d.key} className="row" style={{ gap: 6, fontSize: 12 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} />
                      <span className="text-secondary">{d.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
