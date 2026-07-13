import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr, formatDate } from '../lib/format'
import { recordCorrection } from '../lib/categorize'

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
    await recordCorrection({
      householdId: household.id,
      description: tx.description,
      suggestedCategoryId: previousCategoryId,
      actualCategoryId: newCategoryId || null,
      wasCorrect: previousCategoryId === newCategoryId,
    })
    load()
  }

  const filtered = transactions.filter((t) => t.description?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Transaksjoner</h2>
        <input className="form-input" style={{ width: 240 }} placeholder="Søk…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card">
        <table>
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
            {loading ? (
              <tr><td colSpan={6} className="text-muted">Laster…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-muted">Ingen transaksjoner ennå.</td></tr>
            ) : filtered.map((t) => (
              <tr key={t.id}>
                <td className="text-muted">{formatDate(t.date)}</td>
                <td>{t.description}{t.notes && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.notes}</div>}</td>
                <td className="text-muted">{t.accounts?.display_name}</td>
                <td className="text-muted">{t.profiles?.full_name}</td>
                <td className="text-right">
                  <span className={t.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>
                    {t.type === 'utgift' ? '−' : '+'}{formatKr(t.amount)}
                  </span>
                </td>
                <td>
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
    </div>
  )
}
