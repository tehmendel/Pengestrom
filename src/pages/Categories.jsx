import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import CategoryPicker from '../components/CategoryPicker'
import RecategorizeModal from '../components/RecategorizeModal'

const MATCH_TYPES = [
  { value: 'contains', label: 'Inneholder' },
  { value: 'starts_with', label: 'Starter med' },
  { value: 'exact', label: 'Er nøyaktig' },
]
const MATCH_LABELS = Object.fromEntries(MATCH_TYPES.map((m) => [m.value, m.label]))

const emptyCategoryForm = { name: '', type: 'utgift', description: '', active: true }
const emptyRuleForm = { match_value: '', match_type: 'contains', transaction_type: '', category_id: '', priority: 50, active: true }

function CategoryModal({ category, onClose, onSaved }) {
  const { household } = useAuth()
  const [form, setForm] = useState(category ? {
    name: category.name, type: category.type, description: category.description || '', active: category.active,
  } : emptyCategoryForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    const payload = { name: form.name.trim(), type: form.type, description: form.description.trim() || null, active: form.active }
    const { error } = category
      ? await supabase.from('categories').update(payload).eq('id', category.id)
      : await supabase.from('categories').insert({ ...payload, household_id: household.id })
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-title">{category ? 'Rediger kategori' : 'Ny kategori'}</div>
        <form onSubmit={save}>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Navn</label>
              <input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ width: 130, flexShrink: 0 }}>
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="utgift">Utgift</option>
                <option value="inntekt">Inntekt</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Beskrivelse</label>
            <input className="form-input" placeholder="Valgfritt" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="row" style={{ gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Aktiv (vises i nedtrekkslister)
            </label>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Lagrer…' : 'Lagre'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RuleModal({ rule, categories, onClose, onSaved }) {
  const { household } = useAuth()
  const [form, setForm] = useState(rule ? {
    match_value: rule.match_value,
    match_type: rule.match_type,
    transaction_type: rule.transaction_type || '',
    category_id: rule.category_id,
    priority: rule.priority,
    active: rule.active,
  } : emptyRuleForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredCategories = categories.filter((c) =>
    (c.active || c.id === form.category_id) && (!form.transaction_type || c.type === form.transaction_type)
  )

  async function save(e) {
    e.preventDefault()
    if (!form.match_value.trim()) { setError('Mønster er påkrevd'); return }
    if (!form.category_id) { setError('Kategori er påkrevd'); return }
    setSaving(true)
    setError('')
    const payload = {
      match_value: form.match_value.toLowerCase().trim(),
      match_type: form.match_type,
      transaction_type: form.transaction_type || null,
      category_id: form.category_id,
      priority: Number(form.priority),
      active: form.active,
    }
    const { error } = rule
      ? await supabase.from('categorization_rules').update(payload).eq('id', rule.id)
      : await supabase.from('categorization_rules').insert({ ...payload, household_id: household.id })
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-title">{rule ? 'Rediger regel' : 'Ny kategoriseringsregel'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          Regler matcher mot transaksjonens beskrivelse og setter kategori automatisk. Lavere prioritet kjøres først.
        </div>
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Mønster (tekst å søke etter)</label>
            <input className="form-input" placeholder="f.eks. rema 1000" value={form.match_value}
              onChange={(e) => setForm({ ...form, match_value: e.target.value })} autoFocus />
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Matchtype</label>
              <select className="form-select" value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value })}>
                {MATCH_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-group grow">
              <label className="form-label">Transaksjonstype</label>
              <select className="form-select" value={form.transaction_type}
                onChange={(e) => setForm({ ...form, transaction_type: e.target.value, category_id: '' })}>
                <option value="">Begge</option>
                <option value="inntekt">Kun inntekt</option>
                <option value="utgift">Kun utgift</option>
              </select>
            </div>
            <div className="form-group" style={{ width: 90, flexShrink: 0 }}>
              <label className="form-label">Prioritet</label>
              <input className="form-input" type="number" min="1" max="999" value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kategori</label>
            <CategoryPicker categories={filteredCategories} value={form.category_id} onChange={(id) => setForm({ ...form, category_id: id })} />
          </div>
          <div className="form-group">
            <label className="row" style={{ gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Aktiv
            </label>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Avbryt</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Lagrer…' : 'Lagre'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RulesTab({ categories, rules, reload }) {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editRule, setEditRule] = useState(null)

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]))

  function startEdit(r) {
    setEditRule(r)
    setShowModal(true)
  }

  async function toggleActive(r) {
    await supabase.from('categorization_rules').update({ active: !r.active }).eq('id', r.id)
    reload()
  }

  async function deleteRule(r) {
    if (!window.confirm(`Slette regelen «${r.match_value}»?`)) return
    await supabase.from('categorization_rules').delete().eq('id', r.id)
    reload()
  }

  const filtered = rules.filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.match_value.includes(q) || (catById[r.category_id]?.name || '').toLowerCase().includes(q)
  })

  return (
    <div className="stack">
      {showModal && (
        <RuleModal
          rule={editRule}
          categories={categories}
          onClose={() => { setShowModal(false); setEditRule(null) }}
          onSaved={reload}
        />
      )}

      <div className="row-between flex-wrap" style={{ gap: 'var(--space-3)' }}>
        <input className="form-input" style={{ maxWidth: 300 }} placeholder="Søk mønster eller kategori…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="text-muted" style={{ fontSize: 12 }}>
          {filtered.length} regel{filtered.length === 1 ? '' : 'er'} — kjøres i prioritetsrekkefølge (lavest nummer = først)
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditRule(null); setShowModal(true) }}>+ Ny regel</button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">Ingen regler funnet.</div>
        ) : (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Prior.</th>
                  <th>Mønster</th>
                  <th>Matchtype</th>
                  <th>Type</th>
                  <th>Kategori</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const cat = catById[r.category_id]
                  return (
                    <tr key={r.id} className="list-row" style={{ opacity: r.active ? 1 : 0.5 }}>
                      <td data-label="Prioritet" className="text-mono text-muted" style={{ textAlign: 'center' }}>{r.priority}</td>
                      <td className="list-primary text-mono" style={{ fontSize: 13 }}>{r.match_value}</td>
                      <td data-label="Matchtype" className="text-muted" style={{ fontSize: 13 }}>{MATCH_LABELS[r.match_type] || r.match_type}</td>
                      <td data-label="Type">
                        {r.transaction_type
                          ? <span className={`badge ${r.transaction_type === 'inntekt' ? 'badge-green' : 'badge-neutral'}`}>{r.transaction_type}</span>
                          : <span className="text-muted" style={{ fontSize: 12 }}>begge</span>}
                      </td>
                      <td data-label="Kategori">
                        {cat ? <>{cat.name} <span className="text-muted" style={{ fontSize: 11 }}>({cat.type})</span></> : <span className="text-muted">—</span>}
                      </td>
                      <td data-label="Status">
                        <span className={`badge ${r.active ? 'badge-green' : 'badge-neutral'}`}>{r.active ? 'Aktiv' : 'Inaktiv'}</span>
                      </td>
                      <td data-label="">
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)}>Rediger</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(r)}>{r.active ? 'Deaktiver' : 'Aktiver'}</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => deleteRule(r)}>Slett</button>
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

export default function Categories() {
  const { household } = useAuth()
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('kategorier')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editCategory, setEditCategory] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [recategorize, setRecategorize] = useState(null)

  async function load() {
    const [{ data: cats }, { data: rls }] = await Promise.all([
      supabase.from('categories').select('*').order('type').order('name'),
      supabase.from('categorization_rules').select('*').order('priority').order('match_value'),
    ])
    setCategories(cats || [])
    setRules(rls || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  function startEditCategory(c) {
    setEditCategory(c)
    setShowCategoryModal(true)
  }

  async function toggleCategoryActive(c) {
    await supabase.from('categories').update({ active: !c.active }).eq('id', c.id)
    load()
  }

  async function removeCategory(category) {
    setError('')
    setDeletingId(category.id)
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', category.id)
    setDeletingId(null)

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

  const byType = categories.reduce((acc, c) => { (acc[c.type] = acc[c.type] || []).push(c); return acc }, {})
  const sections = [
    { type: 'inntekt', label: 'Inntektkategorier' },
    { type: 'utgift', label: 'Utgiftkategorier' },
  ]

  if (loading) return <div className="stack"><div className="page-title">Kategorier</div><div className="text-muted">Laster…</div></div>

  return (
    <div className="stack">
      {showCategoryModal && (
        <CategoryModal
          category={editCategory}
          onClose={() => { setShowCategoryModal(false); setEditCategory(null) }}
          onSaved={load}
        />
      )}
      {recategorize && (
        <RecategorizeModal
          category={recategorize.category}
          transactions={recategorize.transactions}
          categories={categories}
          onCancel={() => setRecategorize(null)}
          onDone={() => { setRecategorize(null); load() }}
        />
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Kategorier</div>
          <div className="page-sub">{categories.filter((c) => c.active).length} aktive · {categories.filter((c) => !c.active).length} inaktive</div>
        </div>
        <div className="row">
          <Link to="/leverandorer" className="btn btn-ghost btn-sm">🏪 Leverandørregister</Link>
          {activeTab === 'kategorier' && (
            <button className="btn btn-primary btn-sm" onClick={() => { setEditCategory(null); setShowCategoryModal(true) }}>+ Ny kategori</button>
          )}
        </div>
      </div>

      <div className="row">
        {['kategorier', 'regler'].map((tab) => (
          <button key={tab} className={`chip ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'kategorier' ? 'Kategorier' : 'Regler'}
          </button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}

      {activeTab === 'regler' ? (
        <RulesTab categories={categories} rules={rules} reload={load} />
      ) : (
        <div className="stack">
          {sections.map(({ type, label }) => {
            const list = byType[type] || []
            if (list.length === 0) return null
            return (
              <div key={type} className="stack" style={{ gap: 'var(--space-2)' }}>
                <div className="row">
                  <span className="section-title" style={{ marginBottom: 0 }}>{label}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>{list.filter((c) => c.active).length} aktive</span>
                </div>
                <div className="card">
                  <div className="table-wrap">
                    <table className="list-table">
                      <thead>
                        <tr>
                          <th>Navn</th>
                          <th>Beskrivelse</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((c) => (
                          <tr key={c.id} className="list-row" style={{ opacity: c.active ? 1 : 0.55 }}>
                            <td className="list-primary">{c.name}</td>
                            <td data-label="Beskrivelse" className="text-muted" style={{ fontSize: 13 }}>{c.description || '—'}</td>
                            <td data-label="Status">
                              <span className={`badge ${c.active ? 'badge-green' : 'badge-neutral'}`}>{c.active ? 'Aktiv' : 'Inaktiv'}</span>
                            </td>
                            <td data-label="">
                              <div className="row" style={{ flexWrap: 'nowrap' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => startEditCategory(c)}>Rediger</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => toggleCategoryActive(c)}>{c.active ? 'Deaktiver' : 'Aktiver'}</button>
                                <button className="btn btn-ghost btn-sm" disabled={deletingId === c.id} onClick={() => removeCategory(c)}>
                                  {deletingId === c.id ? '…' : 'Slett'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
