import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Categories() {
  const { household } = useAuth()
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [newCategory, setNewCategory] = useState({ name: '', type: 'utgift' })
  const [newRule, setNewRule] = useState({ match_value: '', match_type: 'contains', category_id: '', transaction_type: '' })

  async function load() {
    const [{ data: cats }, { data: rls }] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('categorization_rules').select('*, categories(name)').order('priority'),
    ])
    setCategories(cats || [])
    setRules(rls || [])
  }

  useEffect(() => { load() }, [household?.id])

  async function addCategory(e) {
    e.preventDefault()
    if (!newCategory.name.trim()) return
    await supabase.from('categories').insert({
      household_id: household.id,
      name: newCategory.name.trim(),
      type: newCategory.type,
    })
    setNewCategory({ name: '', type: 'utgift' })
    load()
  }

  async function addRule(e) {
    e.preventDefault()
    if (!newRule.match_value.trim() || !newRule.category_id) return
    await supabase.from('categorization_rules').insert({
      household_id: household.id,
      match_value: newRule.match_value.trim(),
      match_type: newRule.match_type,
      category_id: newRule.category_id,
      transaction_type: newRule.transaction_type || null,
      priority: rules.length,
      active: true,
    })
    setNewRule({ match_value: '', match_type: 'contains', category_id: '', transaction_type: '' })
    load()
  }

  async function removeRule(id) {
    await supabase.from('categorization_rules').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <h2>Kategorier</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div className="card" style={{ padding: 16 }}>
            <table>
              <thead><tr><th>Navn</th><th>Type</th></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td className="text-muted">{c.type}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={addCategory} className="card" style={{ padding: 16, marginTop: 12, display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="Ny kategori" value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
            <select className="form-select" style={{ width: 140 }} value={newCategory.type}
              onChange={(e) => setNewCategory({ ...newCategory, type: e.target.value })}>
              <option value="utgift">Utgift</option>
              <option value="inntekt">Inntekt</option>
            </select>
            <button className="btn btn-primary" type="submit">Legg til</button>
          </form>
        </div>

        <div>
          <div className="card" style={{ padding: 16 }}>
            <table>
              <thead><tr><th>Tekst inneholder</th><th>Kategori</th><th /></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="text-mono">{r.match_value}</td>
                    <td>{r.categories?.name}</td>
                    <td><button className="btn" onClick={() => removeRule(r.id)}>Fjern</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={addRule} className="card" style={{ padding: 16, marginTop: 12, display: 'grid', gap: 8 }}>
            <input className="form-input" placeholder="F.eks. RIMI, BOLIGKREDITT, IMEDIATE" value={newRule.match_value}
              onChange={(e) => setNewRule({ ...newRule, match_value: e.target.value })} />
            <select className="form-select" value={newRule.category_id}
              onChange={(e) => setNewRule({ ...newRule, category_id: e.target.value })}>
              <option value="">Velg kategori…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-primary" type="submit">Legg til regel</button>
          </form>
        </div>
      </div>
    </div>
  )
}
