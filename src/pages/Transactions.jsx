import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr, formatDate } from '../lib/format'
import { learnFromOutcome } from '../lib/categorize'

export default function Transactions() {
  const { household } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: tx }, { data: cats }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, categories(name), accounts(display_name), profiles:owner_id(full_name)')
        .order('date', { ascending: false })
        .limit(500),
      supabase.from('categories').select('*'),
    ])
    setTransactions(tx || [])
    setCategories(cats || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  async function changeCategory(tx, newCategoryId) {
    const previousCategoryId = tx.category_id
    await supabase.from('transactions').update({ category_id: newCategoryId || null }).eq('id', tx.id)
    await learnFromOutcome({
      householdId: household.id,
      description: tx.description,
      suggestedCategoryId: previousCategoryId,
      finalCategoryId: newCategoryId || null,
    })
    load()
  }

  const filtered = transactions.filter((t) => t.description?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-title">Transaksjoner</div>
      </div>
      <input className="form-input" placeholder="Søk i transaksjoner…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="card">
        {loading ? (
          <div className="empty-state">Laster…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div>Ingen transaksjoner ennå.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Beskrivelse</th>
                  <th>Konto</th>
                  <th>Eier</th>
                  <th className="text-right">Beløp</th>
                  <th>Kategori</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="list-row">
                    <td data-label="Dato" className="text-muted">{formatDate(t.date)}</td>
                    <td className="list-primary">
                      {t.description}
                      {t.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{t.notes}</div>}
                    </td>
                    <td data-label="Konto" className="text-muted">{t.accounts?.display_name}</td>
                    <td data-label="Eier" className="text-muted">{t.profiles?.full_name}</td>
                    <td data-label="Beløp" className="text-right">
                      <span className={t.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>
                        {t.type === 'utgift' ? '−' : '+'}{formatKr(t.amount)}
                      </span>
                    </td>
                    <td data-label="Kategori">
                      <select className="form-select" value={t.category_id || ''} onChange={(e) => changeCategory(t, e.target.value)}>
                        <option value="">Ingen kategori</option>
                        {categories.filter((c) => c.type === t.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
