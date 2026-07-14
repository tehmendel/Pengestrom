import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import CategoryPicker from '../components/CategoryPicker'
import RecategorizeModal from '../components/RecategorizeModal'

const MATCH_TYPES = [
  { value: 'contains', label: 'Inneholder' },
  { value: 'starts_with', label: 'Starter med' },
  { value: 'exact', label: 'Er nøyaktig' },
]

export default function Categories() {
  const { household } = useAuth()
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [newCategory, setNewCategory] = useState({ name: '', type: 'utgift' })
  const [newRule, setNewRule] = useState({ match_value: '', match_type: 'contains', category_id: '' })
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [categoryEdit, setCategoryEdit] = useState({ name: '', type: 'utgift' })
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [ruleEdit, setRuleEdit] = useState({ match_value: '', match_type: 'contains', category_id: '' })
  const [error, setError] = useState('')
  const [recategorize, setRecategorize] = useState(null) // { category, transactions }

  async function load() {
    const [{ data: cats }, { data: rls }] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('categorization_rules').select('*, categories(name, type)').order('priority'),
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

  function startEditCategory(c) {
    setEditingCategoryId(c.id)
    setCategoryEdit({ name: c.name, type: c.type })
  }

  async function saveCategory(id) {
    setError('')
    if (!categoryEdit.name.trim()) return
    const { error } = await supabase.from('categories').update({
      name: categoryEdit.name.trim(),
      type: categoryEdit.type,
    }).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingCategoryId(null)
    load()
  }

  async function removeCategory(category) {
    setError('')
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', category.id)

    if (!count) {
      if (!window.confirm(`Fjerne kategorien «${category.name}»? Regler som bruker den fjernes også.`)) return
      const { error } = await supabase.from('categories').delete().eq('id', category.id)
      if (error) { setError(error.message); return }
      load()
      return
    }

    const otherSameType = categories.filter((c) => c.id !== category.id && c.type === category.type)
    if (otherSameType.length === 0) {
      setError(`${count} transaksjoner bruker «${category.name}» — opprett en annen ${category.type}-kategori å flytte dem til før du kan fjerne denne.`)
      return
    }

    const { data: txs } = await supabase
      .from('transactions')
      .select('id, date, description, amount, type')
      .eq('category_id', category.id)
      .order('date', { ascending: false })
    setRecategorize({ category, transactions: txs || [] })
  }

  async function addRule(e) {
    e.preventDefault()
    if (!newRule.match_value.trim() || !newRule.category_id) return
    await supabase.from('categorization_rules').insert({
      household_id: household.id,
      match_value: newRule.match_value.trim(),
      match_type: newRule.match_type,
      category_id: newRule.category_id,
      priority: rules.length,
      active: true,
    })
    setNewRule({ match_value: '', match_type: 'contains', category_id: '' })
    load()
  }

  function startEditRule(r) {
    setEditingRuleId(r.id)
    setRuleEdit({ match_value: r.match_value, match_type: r.match_type, category_id: r.category_id })
  }

  async function saveRule(id) {
    setError('')
    if (!ruleEdit.match_value.trim() || !ruleEdit.category_id) return
    const { error } = await supabase.from('categorization_rules').update({
      match_value: ruleEdit.match_value.trim(),
      match_type: ruleEdit.match_type,
      category_id: ruleEdit.category_id,
    }).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingRuleId(null)
    load()
  }

  async function removeRule(id) {
    await supabase.from('categorization_rules').delete().eq('id', id)
    load()
  }

  return (
    <div className="stack">
      <div className="page-title">Kategorier</div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      <div className="two-col">
        <div className="stack">
          <div className="section-title">Kategorier</div>
          <div className="card">
            {categories.map((c) => (
              <div key={c.id} style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
                {editingCategoryId === c.id ? (
                  <div className="row">
                    <input className="form-input grow" value={categoryEdit.name}
                      onChange={(e) => setCategoryEdit({ ...categoryEdit, name: e.target.value })} autoFocus />
                    <select className="form-select" style={{ width: 110, flexShrink: 0 }} value={categoryEdit.type}
                      onChange={(e) => setCategoryEdit({ ...categoryEdit, type: e.target.value })}>
                      <option value="utgift">Utgift</option>
                      <option value="inntekt">Inntekt</option>
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={() => saveCategory(c.id)}>Lagre</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingCategoryId(null)}>Avbryt</button>
                  </div>
                ) : (
                  <div className="row-between">
                    <span>{c.name}</span>
                    <div className="row">
                      <span className={`badge ${c.type === 'inntekt' ? 'badge-green' : 'badge-neutral'}`}>{c.type}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEditCategory(c)}>Rediger</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeCategory(c)}>Fjern</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={addCategory} className="card card-pad row">
            <input className="form-input grow" placeholder="Ny kategori" value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
            <select className="form-select" style={{ width: 120, flexShrink: 0 }} value={newCategory.type}
              onChange={(e) => setNewCategory({ ...newCategory, type: e.target.value })}>
              <option value="utgift">Utgift</option>
              <option value="inntekt">Inntekt</option>
            </select>
            <button className="btn btn-primary" type="submit">Legg til</button>
          </form>
        </div>

        <div className="stack">
          <div className="section-title">Kategoriseringsregler</div>
          <div className="card">
            {rules.length === 0 ? (
              <div className="empty-state">Ingen regler ennå.</div>
            ) : rules.map((r) => (
              <div key={r.id} style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
                {editingRuleId === r.id ? (
                  <div className="stack">
                    <div className="row">
                      <input className="form-input grow" value={ruleEdit.match_value}
                        onChange={(e) => setRuleEdit({ ...ruleEdit, match_value: e.target.value })} autoFocus />
                      <select className="form-select" style={{ width: 140, flexShrink: 0 }} value={ruleEdit.match_type}
                        onChange={(e) => setRuleEdit({ ...ruleEdit, match_type: e.target.value })}>
                        {MATCH_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <CategoryPicker categories={categories} value={ruleEdit.category_id}
                      onChange={(id) => setRuleEdit({ ...ruleEdit, category_id: id })} />
                    <div className="row">
                      <button className="btn btn-primary btn-sm" onClick={() => saveRule(r.id)}>Lagre</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingRuleId(null)}>Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <div className="row-between">
                    <div style={{ minWidth: 0 }}>
                      <div className="text-mono" style={{ fontSize: 13 }}>{r.match_value}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{r.categories?.name}</div>
                    </div>
                    <div className="row">
                      <span className={`badge ${r.categories?.type === 'inntekt' ? 'badge-green' : 'badge-neutral'}`}>{r.categories?.type}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEditRule(r)}>Rediger</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeRule(r.id)}>Fjern</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={addRule} className="card card-pad stack">
            <input className="form-input" placeholder="F.eks. RIMI, BOLIGKREDITT, IMEDIATE" value={newRule.match_value}
              onChange={(e) => setNewRule({ ...newRule, match_value: e.target.value })} />
            <select className="form-select" value={newRule.match_type}
              onChange={(e) => setNewRule({ ...newRule, match_type: e.target.value })}>
              {MATCH_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <CategoryPicker categories={categories} value={newRule.category_id}
              onChange={(id) => setNewRule({ ...newRule, category_id: id })} />
            <button className="btn btn-primary" type="submit">Legg til regel</button>
          </form>
        </div>
      </div>

      {recategorize && (
        <RecategorizeModal
          category={recategorize.category}
          transactions={recategorize.transactions}
          categories={categories}
          onCancel={() => setRecategorize(null)}
          onDone={() => { setRecategorize(null); load() }}
        />
      )}
    </div>
  )
}
