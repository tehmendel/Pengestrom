import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr, formatDate } from '../lib/format'

// Dark-mode categorical palette, fixed order (dataviz skill reference palette).
const CATEGORY_COLORS = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926']
const GREEN = '#22c55e'
const RED = '#ef4444'

const QUICK_LINKS = [
  { to: '/formue', label: 'Formue', icon: '💰' },
  { to: '/lan', label: 'Lån', icon: '🏦' },
  { to: '/investeringer', label: 'Investeringer', icon: '📈' },
  { to: '/pensjon', label: 'Pensjon', icon: '🛡️' },
  { to: '/faste-utgifter', label: 'Faste utgifter', icon: '🔁' },
  { to: '/skatt', label: 'Skatt', icon: '🧾' },
]

function monthLabel(date) {
  return date.toLocaleDateString('nb-NO', { month: 'short' }).replace('.', '')
}

export default function Dashboard() {
  const { household, user } = useAuth()
  const [scope, setScope] = useState('household')
  const [netWorth, setNetWorth] = useState(0)
  const [categoryRows, setCategoryRows] = useState([])
  const [monthlyRows, setMonthlyRows] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthName = now.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })

  useEffect(() => {
    if (!household?.id) return
    supabase.rpc('household_net_worth', { p_household_id: household.id }).then(({ data }) => {
      setNetWorth((data || []).reduce((sum, r) => sum + Number(r.total_amount), 0))
    })
  }, [household?.id])

  useEffect(() => {
    if (!household?.id) return
    setLoading(true)

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

    async function run() {
      let categoryQuery
      if (scope === 'household') {
        const { data } = await supabase.rpc('household_category_totals', { p_household_id: household.id })
        categoryQuery = (data || []).filter((r) => r.year === year && r.month === month && r.type === 'utgift')
      } else {
        const { data } = await supabase
          .from('transactions')
          .select('amount, categories(name)')
          .eq('owner_id', user.id)
          .eq('type', 'utgift')
          .gte('date', `${year}-${String(month).padStart(2, '0')}-01`)
        const grouped = new Map()
        for (const t of data || []) {
          const name = t.categories?.name || 'Ukategorisert'
          grouped.set(name, (grouped.get(name) || 0) + Number(t.amount))
        }
        categoryQuery = Array.from(grouped, ([category_name, total_amount]) => ({ category_name, total_amount }))
      }
      setCategoryRows(categoryQuery)

      let txQuery = supabase.from('transactions').select('date, amount, type').gte('date', fromDate)
      if (scope === 'personal') txQuery = txQuery.eq('owner_id', user.id)
      const { data: sixMonthTx } = await txQuery

      const byMonth = new Map()
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        byMonth.set(`${d.getFullYear()}-${d.getMonth()}`, { month: monthLabel(d), inntekt: 0, utgift: 0 })
      }
      for (const t of sixMonthTx || []) {
        const d = new Date(t.date)
        const key = `${d.getFullYear()}-${d.getMonth()}`
        const bucket = byMonth.get(key)
        if (!bucket) continue
        if (t.type === 'inntekt') bucket.inntekt += Number(t.amount)
        else bucket.utgift += Number(t.amount)
      }
      setMonthlyRows(Array.from(byMonth.values()))

      let recentQuery = supabase
        .from('transactions')
        .select('id, date, description, amount, type, categories(name)')
        .order('date', { ascending: false })
        .limit(6)
      if (scope === 'personal') recentQuery = recentQuery.eq('owner_id', user.id)
      const { data: recentTx } = await recentQuery
      setRecent(recentTx || [])

      setLoading(false)
    }

    run()
  }, [household?.id, scope, user?.id])

  const categoryChartData = useMemo(() =>
    categoryRows
      .map((r) => ({ name: r.category_name || 'Ukategorisert', total: Number(r.total_amount) }))
      .sort((a, b) => b.total - a.total),
    [categoryRows]
  )

  const monthTotal = categoryChartData.reduce((acc, r) => acc + r.total, 0)
  const thisMonth = monthlyRows[monthlyRows.length - 1] || { inntekt: 0, utgift: 0 }
  const savingsRate = thisMonth.inntekt > 0 ? Math.round(((thisMonth.inntekt - thisMonth.utgift) / thisMonth.inntekt) * 100) : 0

  const statCards = [
    { label: 'Netto formue', value: formatKr(netWorth), icon: '💰', chip: 'icon-chip-blue' },
    { label: `Inntekt i ${now.toLocaleDateString('nb-NO', { month: 'long' })}`, value: formatKr(thisMonth.inntekt), tone: 'positive', icon: '📈', chip: 'icon-chip-green' },
    { label: `Utgifter i ${now.toLocaleDateString('nb-NO', { month: 'long' })}`, value: formatKr(thisMonth.utgift), tone: 'negative', icon: '📉', chip: 'icon-chip-red' },
    { label: 'Sparerate', value: `${savingsRate}%`, tone: savingsRate >= 0 ? 'positive' : 'negative', icon: '🏦', chip: 'icon-chip-yellow' },
  ]

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="page-title">Min oversikt</div>
          <div className="page-sub" style={{ textTransform: 'capitalize' }}>{monthName}</div>
        </div>
        <div className="row" style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          <button className="btn btn-sm" style={{ border: 'none', background: scope === 'household' ? 'var(--surface-3)' : 'transparent' }} onClick={() => setScope('household')}>Husstand</button>
          <button className="btn btn-sm" style={{ border: 'none', background: scope === 'personal' ? 'var(--surface-3)' : 'transparent' }} onClick={() => setScope('personal')}>Meg</button>
        </div>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {statCards.map((s) => (
          <div key={s.label} className="card card-pad">
            <div className="row" style={{ marginBottom: 4 }}>
              <span className={`icon-chip ${s.chip}`}>{s.icon}</span>
              <span className="stat-label">{s.label}</span>
            </div>
            <div
              className={s.tone === 'positive' ? 'amount-positive' : s.tone === 'negative' ? 'amount-negative' : ''}
              style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="row flex-wrap">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="card card-pad row" style={{ textDecoration: 'none', color: 'var(--text)', flex: '1 1 140px' }}>
            <span style={{ fontSize: 18 }}>{l.icon}</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{l.label}</span>
          </Link>
        ))}
      </div>

      <div className="card card-pad" style={{ height: 300 }}>
        <div className="section-title">Inntekt vs utgifter — siste 6 måneder</div>
        {loading ? (
          <div className="text-muted">Laster…</div>
        ) : (
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={monthlyRows} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v) => formatKr(v)}
                cursor={{ fill: 'var(--surface-2)' }}
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: 'var(--text)' }}
                itemStyle={{ color: 'var(--text)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="inntekt" name="Inntekt" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="utgift" name="Utgifter" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card card-pad" style={{ height: 340 }}>
        <div className="row-between" style={{ marginBottom: 4 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Utgifter per kategori denne måneden</div>
          <span className="text-mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{formatKr(monthTotal)}</span>
        </div>
        {loading ? (
          <div className="text-muted">Laster…</div>
        ) : categoryChartData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div>Ingen transaksjoner denne måneden ennå.</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="88%">
            <BarChart data={categoryChartData} layout="vertical" margin={{ left: 8, right: 8 }} barCategoryGap={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted)" fontSize={11} tickFormatter={(v) => `${v} kr`} />
              <YAxis type="category" dataKey="name" width={130} stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v) => formatKr(v)}
                cursor={{ fill: 'var(--surface-2)' }}
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: 'var(--text)' }}
                itemStyle={{ color: 'var(--text)' }}
              />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {categoryChartData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="section-title">Siste transaksjoner</div>
        </div>
        {loading ? (
          <div className="empty-state">Laster…</div>
        ) : recent.length === 0 ? (
          <div className="empty-state">Ingen transaksjoner ennå.</div>
        ) : recent.map((t) => (
          <div key={t.id} className="row-between" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>{t.categories?.name || 'Ukategorisert'} · {formatDate(t.date)}</div>
            </div>
            <span className={t.type === 'inntekt' ? 'amount-positive' : 'amount-negative'} style={{ fontWeight: 600 }}>
              {t.type === 'utgift' ? '−' : '+'}{formatKr(t.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
