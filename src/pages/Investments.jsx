import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr, formatDate } from '../lib/format'
import { INSTRUMENT_TYPES as TYPES } from '../lib/constants'

const emptyForm = { account_id: '', instrument_name: '', instrument_type: 'fond', isin: '', quantity: '', avg_price: '', current_price: '' }

function gainPct(h) {
  const avg = Number(h.avg_price)
  if (avg <= 0) return 0
  return ((Number(h.current_price) - avg) / avg) * 100
}

export default function Investments() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [holdings, setHoldings] = useState([])
  const [priceHistory, setPriceHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('alle')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [fetchNote, setFetchNote] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkResult, setBulkResult] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: accs }, { data: hlds }] = await Promise.all([
      supabase.from('accounts').select('*').eq('account_type', 'investment'),
      // Kun beholdninger knyttet til en investeringskonto — pensjonsfond (knyttet
      // til en pensjonskonto, account_id null) hører til på Pensjon-siden.
      supabase.from('holdings').select('*, accounts(display_name)').not('account_id', 'is', null).order('created_at', { ascending: true }),
    ])
    setAccounts(accs || [])
    setHoldings(hlds || [])

    const ids = (hlds || []).map((h) => h.id)
    if (ids.length > 0) {
      const { data: snaps } = await supabase
        .from('holding_price_snapshots')
        .select('holding_id, snapshot_date, price')
        .in('holding_id', ids)
        .order('snapshot_date', { ascending: true })
      setPriceHistory(snaps || [])
    } else {
      setPriceHistory([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  function startAdd() {
    setForm(emptyForm)
    setEditingId(null)
    setFetchNote('')
    setShowForm(true)
  }

  function startEdit(h) {
    setForm({
      account_id: h.account_id,
      instrument_name: h.instrument_name,
      instrument_type: h.instrument_type,
      isin: h.isin || '',
      quantity: String(h.quantity),
      avg_price: String(h.avg_price),
      current_price: String(h.current_price),
    })
    setEditingId(h.id)
    setFetchNote('')
    setShowForm(true)
  }

  async function fetchLatestPrice() {
    if (!form.isin.trim()) { setError('Fyll inn ISIN først'); return }
    setFetchingPrice(true)
    setError('')
    setFetchNote('')
    const { data, error } = await supabase.functions.invoke('fetch-storebrand-fund-price', { body: { isin: form.isin.trim() } })
    setFetchingPrice(false)
    if (error || data?.error) {
      setError(`Kunne ikke hente kurs automatisk (${data?.error || error.message}) — fyll inn manuelt.`)
      return
    }
    setForm((f) => ({ ...f, current_price: String(data.price) }))
    setFetchNote(`Hentet ${formatKr(data.price)} (kursdato ${formatDate(data.priceDate)}).`)
  }

  async function bulkUpdatePrices() {
    const targets = holdings.filter((h) => h.instrument_type === 'fond' && h.isin)
    if (targets.length === 0) { setBulkResult('Ingen fond med registrert ISIN å oppdatere.'); return }
    setBulkUpdating(true)
    setBulkResult('')
    let okCount = 0
    const failed = []
    const today = new Date().toISOString().slice(0, 10)
    for (const h of targets) {
      const { data, error } = await supabase.functions.invoke('fetch-storebrand-fund-price', { body: { isin: h.isin } })
      if (error || data?.error) {
        failed.push(h.instrument_name)
        continue
      }
      await supabase.from('holdings').update({ current_price: data.price, updated_at: new Date().toISOString() }).eq('id', h.id)
      await supabase.from('holding_price_snapshots')
        .upsert({ holding_id: h.id, snapshot_date: today, price: data.price }, { onConflict: 'holding_id,snapshot_date' })
      okCount++
    }
    setBulkUpdating(false)
    setBulkResult(`Oppdaterte ${okCount} av ${targets.length} fond.${failed.length ? ' Feilet: ' + failed.join(', ') : ''}`)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.account_id || !form.instrument_name.trim()) return
    setSaving(true)
    setError('')

    const payload = {
      account_id: form.account_id,
      instrument_name: form.instrument_name.trim(),
      instrument_type: form.instrument_type,
      isin: form.isin.trim() || null,
      quantity: Number(form.quantity) || 0,
      avg_price: Number(form.avg_price) || 0,
      current_price: Number(form.current_price) || 0,
    }

    let holdingId = editingId
    const { data: saved, error } = editingId
      ? await supabase.from('holdings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId).select().single()
      : await supabase.from('holdings').insert({ ...payload, household_id: household.id, owner_id: user.id }).select().single()

    if (!error && saved) {
      holdingId = saved.id
      await supabase.from('holding_price_snapshots')
        .upsert({ holding_id: holdingId, snapshot_date: new Date().toISOString().slice(0, 10), price: payload.current_price }, { onConflict: 'holding_id,snapshot_date' })
    }

    setSaving(false)
    if (error) { setError(error.message); return }
    setShowForm(false)
    setForm(emptyForm)
    setEditingId(null)
    load()
  }

  async function remove(id) {
    if (!window.confirm('Fjerne denne beholdningen?')) return
    await supabase.from('holdings').delete().eq('id', id)
    load()
  }

  const filtered = filter === 'alle' ? holdings : holdings.filter((h) => h.instrument_type === filter)
  const totalValue = filtered.reduce((sum, h) => sum + Number(h.quantity) * Number(h.current_price), 0)
  const totalCost = filtered.reduce((sum, h) => sum + Number(h.quantity) * Number(h.avg_price), 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  const { best, worst } = useMemo(() => {
    const withGain = filtered.filter((h) => Number(h.avg_price) > 0)
    if (withGain.length === 0) return { best: null, worst: null }
    const sorted = [...withGain].sort((a, b) => gainPct(b) - gainPct(a))
    return { best: sorted[0], worst: sorted[sorted.length - 1] }
  }, [filtered])

  const chartData = useMemo(() => {
    if (priceHistory.length === 0 || holdings.length === 0) return []
    const holdingIds = new Set(filtered.map((h) => h.id))
    const qtyById = Object.fromEntries(holdings.map((h) => [h.id, Number(h.quantity)]))
    const byDate = new Map()
    for (const snap of priceHistory) {
      if (!holdingIds.has(snap.holding_id)) continue
      const qty = qtyById[snap.holding_id] || 0
      const existing = byDate.get(snap.snapshot_date) || 0
      byDate.set(snap.snapshot_date, existing + Number(snap.price) * qty)
    }
    return Array.from(byDate, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
  }, [priceHistory, filtered, holdings])

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-title">Investeringer</div>
        <div className="row">
          <button className="btn btn-sm" disabled={bulkUpdating} onClick={bulkUpdatePrices}>
            {bulkUpdating ? 'Oppdaterer…' : '↻ Oppdater fondskurser'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={showForm ? () => setShowForm(false) : startAdd}>
            {showForm ? 'Avbryt' : '+ Legg til'}
          </button>
        </div>
      </div>

      {bulkResult && (
        <div className="card card-pad" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{bulkResult}</div>
      )}

      <div className="text-muted" style={{ fontSize: 11, marginTop: -8 }}>
        Automatisk oppdatering av fondskurser kjører også hver natt for fond med registrert ISIN — knappen henter en fersk kurs med en gang.
      </div>

      {accounts.length === 0 && !showForm && (
        <div className="card card-pad" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Opprett en konto med type «Fond/aksjer» under Kontoer først, så kan du registrere beholdninger her.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card card-pad">
          <div className="form-group">
            <label className="form-label">Konto</label>
            <select className="form-select" required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Velg konto…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name} ({a.institution})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Navn på instrument</label>
            <input className="form-input" required placeholder="F.eks. DNB Global Indeks" value={form.instrument_name}
              onChange={(e) => setForm({ ...form, instrument_name: e.target.value })} />
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.instrument_type} onChange={(e) => setForm({ ...form, instrument_type: e.target.value })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group grow">
              <label className="form-label">ISIN</label>
              <input className="form-input" placeholder="F.eks. XL8000000918" value={form.isin} onChange={(e) => setForm({ ...form, isin: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Antall</label>
              <input className="form-input" type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Snittpris</label>
              <input className="form-input" type="number" step="any" value={form.avg_price} onChange={(e) => setForm({ ...form, avg_price: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Nåværende kurs</label>
              <input className="form-input" type="number" step="any" value={form.current_price} onChange={(e) => setForm({ ...form, current_price: e.target.value })} />
            </div>
          </div>
          {form.instrument_type === 'fond' && (
            <div className="row" style={{ marginBottom: 'var(--space-3)', alignItems: 'center' }}>
              <button type="button" className="btn btn-sm" disabled={fetchingPrice} onClick={fetchLatestPrice}>
                {fetchingPrice ? 'Henter…' : '↻ Hent siste kurs'}
              </button>
              <span className="text-muted" style={{ fontSize: 11 }}>Best-effort fra Storebrands åpne fonddata — kan slutte å virke, sjekk alltid tallet.</span>
            </div>
          )}
          {fetchNote && <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 'var(--space-3)' }}>{fetchNote}</div>}
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Lagrer…' : 'Lagre'}</button>
        </form>
      )}

      <div className="row flex-wrap">
        {['alle', ...TYPES.map((t) => t.value)].map((v) => (
          <button key={v} className={`btn btn-sm ${filter === v ? 'btn-primary' : ''}`} onClick={() => setFilter(v)}>
            {v === 'alle' ? 'Alle' : TYPES.find((t) => t.value === v).label}
          </button>
        ))}
      </div>

      {!loading && filtered.length > 0 && (
        <>
          <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="card card-pad">
              <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
                <span className="icon-chip icon-chip-blue">💼</span>
                <span className="stat-label">Total verdi</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{formatKr(totalValue)}</div>
            </div>
            <div className="card card-pad">
              <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
                <span className={`icon-chip ${totalGain >= 0 ? 'icon-chip-green' : 'icon-chip-red'}`}>{totalGain >= 0 ? '📈' : '📉'}</span>
                <span className="stat-label">Gevinst/tap</span>
              </div>
              <div className={totalGain >= 0 ? 'amount-positive' : 'amount-negative'} style={{ fontSize: 20, fontWeight: 600 }}>
                {totalGain >= 0 ? '+' : '−'}{formatKr(Math.abs(totalGain))} ({totalGain >= 0 ? '+' : '−'}{Math.abs(totalGainPct).toFixed(1)}%)
              </div>
            </div>
            {best && (
              <div className="card card-pad">
                <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
                  <span className="icon-chip icon-chip-green">🏆</span>
                  <span className="stat-label">Best utvikling</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{best.instrument_name}</div>
                <div className="amount-positive" style={{ fontSize: 13 }}>{gainPct(best) >= 0 ? '+' : '−'}{Math.abs(gainPct(best)).toFixed(1)}%</div>
              </div>
            )}
            {worst && worst !== best && (
              <div className="card card-pad">
                <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
                  <span className="icon-chip icon-chip-red">🔻</span>
                  <span className="stat-label">Svakest utvikling</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{worst.instrument_name}</div>
                <div className={gainPct(worst) >= 0 ? 'amount-positive' : 'amount-negative'} style={{ fontSize: 13 }}>{gainPct(worst) >= 0 ? '+' : '−'}{Math.abs(gainPct(worst)).toFixed(1)}%</div>
              </div>
            )}
          </div>

          {chartData.length >= 2 && (
            <div className="card card-pad" style={{ height: 260 }}>
              <div className="section-title">Verdiutvikling</div>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={chartData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} tickFormatter={formatDate} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v) => formatKr(v)}
                    labelFormatter={formatDate}
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ color: 'var(--text)' }}
                    itemStyle={{ color: 'var(--text)' }}
                  />
                  <Line type="monotone" dataKey="value" name="Verdi" stroke="#3987e5" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Laster…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div>Ingen beholdninger registrert ennå.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Type</th>
                  <th className="text-right">Antall</th>
                  <th className="text-right">Snittpris</th>
                  <th className="text-right">Nåverdi</th>
                  <th className="text-right">Gevinst/tap</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => {
                  const value = Number(h.quantity) * Number(h.current_price)
                  const gain = (Number(h.current_price) - Number(h.avg_price)) * Number(h.quantity)
                  return (
                    <tr key={h.id} className="list-row">
                      <td className="list-primary">
                        {h.instrument_name}
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{h.accounts?.display_name}</div>
                      </td>
                      <td data-label="Type"><span className="badge badge-neutral">{TYPES.find((t) => t.value === h.instrument_type)?.label}</span></td>
                      <td data-label="Antall" className="text-right text-mono">{h.quantity}</td>
                      <td data-label="Snittpris" className="text-right text-mono">{formatKr(h.avg_price)}</td>
                      <td data-label="Nåverdi" className="text-right text-mono">{formatKr(value)}</td>
                      <td data-label="Gevinst/tap" className="text-right">
                        <span className={gain >= 0 ? 'amount-positive' : 'amount-negative'}>{gain >= 0 ? '+' : '−'}{formatKr(Math.abs(gain))}</span>
                      </td>
                      <td data-label="">
                        <div className="row">
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(h)}>Rediger</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => remove(h.id)}>Fjern</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
