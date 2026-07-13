import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr } from '../lib/format'

const COLORS = ['#4f8cff', '#3ecf8e', '#e6b450', '#e5484d', '#a78bfa', '#f472b6', '#38bdf8', '#fb923c']

export default function Dashboard() {
  const { household, user } = useAuth()
  const [scope, setScope] = useState('household')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  useEffect(() => {
    if (!household?.id) return
    setLoading(true)

    if (scope === 'household') {
      supabase.rpc('household_category_totals', { p_household_id: household.id }).then(({ data }) => {
        setRows((data || []).filter((r) => r.year === year && r.month === month && r.type === 'utgift'))
        setLoading(false)
      })
    } else {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      supabase
        .from('transactions')
        .select('amount, categories(name)')
        .eq('owner_id', user.id)
        .eq('type', 'utgift')
        .gte('date', from)
        .then(({ data }) => {
          const grouped = new Map()
          for (const t of data || []) {
            const name = t.categories?.name || 'Ukategorisert'
            grouped.set(name, (grouped.get(name) || 0) + Number(t.amount))
          }
          setRows(Array.from(grouped, ([category_name, total_amount]) => ({ category_name, total_amount })))
          setLoading(false)
        })
    }
  }, [household?.id, scope, user?.id])

  const chartData = useMemo(() =>
    rows
      .map((r) => ({ name: r.category_name || 'Ukategorisert', total: Number(r.total_amount) }))
      .sort((a, b) => b.total - a.total),
    [rows]
  )

  const sum = chartData.reduce((acc, r) => acc + r.total, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Oversikt — {now.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${scope === 'household' ? 'btn-primary' : ''}`} onClick={() => setScope('household')}>Husstand</button>
          <button className={`btn ${scope === 'personal' ? 'btn-primary' : ''}`} onClick={() => setScope('personal')}>Meg</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Totalt forbruk denne måneden</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{formatKr(sum)}</div>
      </div>

      <div className="card" style={{ padding: 16, height: 360 }}>
        {loading ? (
          <div className="text-muted">Laster…</div>
        ) : chartData.length === 0 ? (
          <div className="text-muted">Ingen transaksjoner denne måneden ennå.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted)" tickFormatter={(v) => `${v} kr`} />
              <YAxis type="category" dataKey="name" width={140} stroke="var(--muted)" />
              <Tooltip formatter={(v) => formatKr(v)} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
