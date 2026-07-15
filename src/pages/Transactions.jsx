import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr, formatDate } from '../lib/format'
import { fetchActiveRules, matchAgainstRules, matchAgainstVendors, learnFromOutcome } from '../lib/categorize'

const emptyForm = { date: '', description: '', amount: '', type: 'utgift', account_id: '', category_id: '', notes: '' }

function TransactionModal({ tx, categories, accounts, defaultAccountId, onClose, onSaved }) {
  const { household, user } = useAuth()
  const [form, setForm] = useState(tx ? {
    date: tx.date, description: tx.description, amount: String(tx.amount), type: tx.type,
    account_id: tx.account_id, category_id: tx.category_id || '', notes: tx.notes || '',
  } : { ...emptyForm, account_id: defaultAccountId || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!form.date || !form.description.trim() || form.amount === '' || !form.account_id) return
    setSaving(true)
    setError('')
    const payload = {
      date: form.date,
      description: form.description.trim(),
      amount: Number(form.amount),
      type: form.type,
      account_id: form.account_id,
      category_id: form.category_id || null,
      notes: form.notes.trim() || null,
    }
    const { error } = tx
      ? await supabase.from('transactions').update(payload).eq('id', tx.id)
      : await supabase.from('transactions').insert({ ...payload, household_id: household.id, owner_id: user.id, source: 'manual' })
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{tx ? 'Rediger transaksjon' : 'Ny transaksjon'}</div>
        <form onSubmit={save}>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Dato</label>
              <input className="form-input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="form-group" style={{ width: 130, flexShrink: 0 }}>
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category_id: '' })}>
                <option value="utgift">Utgift</option>
                <option value="inntekt">Inntekt</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Beskrivelse</label>
            <input className="form-input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Beløp (kr)</label>
              <input className="form-input" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Konto</label>
              <select className="form-select" required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Velg konto…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name} ({a.institution})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kategori</label>
            <select className="form-select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Ingen kategori</option>
              {categories.filter((c) => c.type === form.type && (c.active || c.id === tx?.category_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notater</label>
            <textarea className="form-input" style={{ minHeight: 70 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

const SOURCE_LABELS = { manual: 'Manuell', csv: 'CSV-import', pdf: 'PDF-import', open_banking: 'Bankkobling' }

function TransactionDetailModal({ tx, onClose }) {
  const fields = [
    { label: 'Dato', value: formatDate(tx.date) },
    { label: 'Beskrivelse', value: tx.description },
    { label: 'Beløp', value: `${tx.type === 'utgift' ? '−' : '+'}${formatKr(tx.amount)}` },
    { label: 'Type', value: tx.type === 'inntekt' ? 'Inntekt' : 'Utgift' },
    { label: 'Kategori', value: tx.categories?.name || '—' },
    { label: 'Konto', value: tx.accounts?.display_name || '—' },
    { label: 'Eier', value: tx.profiles?.full_name || '—' },
    { label: 'Notater', value: tx.notes || '—' },
    { label: 'Kilde', value: SOURCE_LABELS[tx.source] || tx.source },
    { label: 'Registrert', value: tx.created_at ? new Date(tx.created_at).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
  ]
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-title">Transaksjonsdetaljer</div>
        <div className="stack" style={{ gap: 0, marginBottom: tx.raw_source ? 'var(--space-4)' : 0 }}>
          {fields.map((f) => (
            <div key={f.label} className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', gap: 'var(--space-3)' }}>
              <span className="text-muted" style={{ fontSize: 12, flexShrink: 0 }}>{f.label}</span>
              <span style={{ fontSize: 13, textAlign: 'right', wordBreak: 'break-word' }}>{f.value}</span>
            </div>
          ))}
        </div>
        {tx.raw_source && (
          <>
            <div className="form-label">Rådata fra import</div>
            <pre style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflowY: 'auto',
            }}>
              {tx.raw_source}
            </pre>
          </>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Lukk</button>
        </div>
      </div>
    </div>
  )
}

export default function Transactions() {
  const { household, user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [lastImport, setLastImport] = useState(null)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('alle')
  const [filterCategory, setFilterCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [detailTx, setDetailTx] = useState(null)

  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  const [autoCategorizing, setAutoCategorizing] = useState(false)
  const [autoResult, setAutoResult] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: tx }, { data: cats }, { data: accs }, { data: imp }] = await Promise.all([
      supabase.from('transactions').select('*, categories(name), accounts(display_name)').order('date', { ascending: false }).limit(1000),
      supabase.from('categories').select('*'),
      supabase.from('accounts').select('id, display_name, institution, is_default, owner_id'),
      supabase.from('bank_imports').select('imported_at, transaction_count, filename').order('imported_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    // transactions.owner_id and profiles.id both reference auth.users(id)
    // independently, so PostgREST can't embed profiles directly — fetch and merge instead.
    const ownerIds = [...new Set((tx || []).map((t) => t.owner_id))]
    const { data: profiles } = ownerIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', ownerIds)
      : { data: [] }
    const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]))

    setTransactions((tx || []).map((t) => ({ ...t, profiles: profileById[t.owner_id] || null })))
    setCategories(cats || [])
    setAccounts(accs || [])
    setLastImport(imp || null)
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  const defaultAccountId = accounts.find((a) => a.is_default && a.owner_id === user?.id)?.id || ''
  // Inactive categories stay assignable to nothing new, but the filter
  // dropdown still lists them so past transactions remain findable.
  const activeCategories = categories.filter((c) => c.active)
  // A transaction already pointing at a since-deactivated category keeps
  // that option visible in its own row, so the select doesn't silently
  // appear to show "Ingen kategori" for something that's actually still set.
  function categoryOptionsFor(type, currentId) {
    return categories.filter((c) => c.type === type && (c.active || c.id === currentId))
  }

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

  async function deleteTransaction(id) {
    if (!window.confirm('Slette denne transaksjonen?')) return
    await supabase.from('transactions').delete().eq('id', id)
    load()
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function bulkSetCategory() {
    if (!bulkCategoryId || !selectedIds.size) return
    setBulkSaving(true)
    await supabase.from('transactions').update({ category_id: bulkCategoryId }).in('id', [...selectedIds])
    setBulkSaving(false)
    setSelectedIds(new Set())
    setBulkCategoryId('')
    load()
  }

  async function bulkDelete() {
    if (!selectedIds.size) return
    if (!window.confirm(`Slette ${selectedIds.size} transaksjoner? Dette kan ikke angres.`)) return
    setBulkSaving(true)
    await supabase.from('transactions').delete().in('id', [...selectedIds])
    setBulkSaving(false)
    setSelectedIds(new Set())
    load()
  }

  async function autoCategorize() {
    setAutoCategorizing(true)
    setAutoResult(null)
    const rules = await fetchActiveRules(household.id)
    const uncategorized = transactions.filter((t) => !t.category_id)

    const updates = []
    for (const t of uncategorized) {
      const ruleHit = matchAgainstRules(rules, t.description, t.type)
      const vendorHit = ruleHit ? null : await matchAgainstVendors(household.id, t.description)
      const categoryId = ruleHit?.categoryId || vendorHit?.categoryId || null
      if (categoryId) updates.push({ id: t.id, categoryId })
    }

    if (updates.length > 0) {
      const byCategory = new Map()
      for (const u of updates) {
        if (!byCategory.has(u.categoryId)) byCategory.set(u.categoryId, [])
        byCategory.get(u.categoryId).push(u.id)
      }
      await Promise.all([...byCategory].map(([categoryId, ids]) =>
        supabase.from('transactions').update({ category_id: categoryId }).in('id', ids)
      ))
      await load()
    }
    setAutoResult({ count: updates.length, total: uncategorized.length })
    setAutoCategorizing(false)
  }

  function resetFilters() {
    setSearch(''); setFilterCategory(''); setFilterType('alle'); setDateFrom(''); setDateTo('')
  }

  function matchesSearch(t, q) {
    const s = q.toLowerCase()
    return [t.description, t.notes, t.categories?.name, t.accounts?.display_name, String(t.amount)]
      .some((v) => (v || '').toString().toLowerCase().includes(s))
  }

  const countByCategory = useMemo(() => transactions.reduce((acc, t) => {
    if (filterType !== 'alle' && t.type !== filterType) return acc
    if (search && !matchesSearch(t, search)) return acc
    if (dateFrom && t.date < dateFrom) return acc
    if (dateTo && t.date > dateTo) return acc
    const key = t.category_id || '__ingen__'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {}), [transactions, filterType, search, dateFrom, dateTo])

  const filtered = transactions.filter((t) => {
    if (filterType !== 'alle' && t.type !== filterType) return false
    if (filterCategory && t.category_id !== filterCategory) return false
    if (search && !matchesSearch(t, search)) return false
    if (dateFrom && t.date < dateFrom) return false
    if (dateTo && t.date > dateTo) return false
    return true
  })

  const uncategorizedCount = transactions.filter((t) => !t.category_id).length
  const filtersActive = search || filterCategory || filterType !== 'alle' || dateFrom || dateTo

  return (
    <div className="stack">
      {showModal && (
        <TransactionModal
          tx={editItem}
          categories={categories}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={load}
        />
      )}
      {detailTx && <TransactionDetailModal tx={detailTx} onClose={() => setDetailTx(null)} />}

      <div className="page-header">
        <div>
          <div className="page-title">Transaksjoner</div>
          <div className="row flex-wrap" style={{ gap: 'var(--space-3)' }}>
            <span className="text-muted" style={{ fontSize: 12 }}>{filtered.length} av {transactions.length} poster</span>
            {lastImport && (
              <span className="text-muted" style={{ fontSize: 11 }}>
                Sist importert: {formatDate(lastImport.imported_at)} · {lastImport.transaction_count} transaksjoner{lastImport.filename ? ` · ${lastImport.filename}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="row flex-wrap">
          <Link to="/importer" className="btn btn-ghost btn-sm">⬆ Importer kontoutskrift</Link>
          {uncategorizedCount > 0 && (
            <button className="btn btn-ghost btn-sm" disabled={autoCategorizing} onClick={autoCategorize}>
              {autoCategorizing ? 'Kategoriserer…' : `◈ Kategoriser automatisk (${uncategorizedCount})`}
            </button>
          )}
          <button
            className={`btn btn-sm ${bulkMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setBulkMode((v) => !v); setSelectedIds(new Set()); setBulkCategoryId('') }}
          >
            {bulkMode ? `☑ Avslutt valg (${selectedIds.size})` : '☑ Velg flere'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditItem(null); setShowModal(true) }}>+ Ny transaksjon</button>
        </div>
      </div>

      {autoResult !== null && (
        <div className="card card-pad row-between">
          <span style={{ fontSize: 13 }}>
            {autoResult.count > 0
              ? `◈ ${autoResult.count} transaksjoner fikk kategori automatisk (regel eller leverandørhistorikk).`
              : `Ingen regler eller leverandørhistorikk matchet de ${autoResult.total} ukategoriserte transaksjonene.`}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setAutoResult(null)}>×</button>
        </div>
      )}

      <div className="card card-pad stack" style={{ gap: 'var(--space-3)' }}>
        <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Søk beskrivelse</label>
            <input className="form-input" placeholder="Søk…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Kategori</label>
            <select className="form-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">Alle kategorier</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({countByCategory[c.id] || 0})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fra dato</label>
            <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Til dato</label>
            <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="row flex-wrap">
          <span className="text-muted" style={{ fontSize: 12 }}>Type:</span>
          {['alle', 'inntekt', 'utgift'].map((f) => (
            <button key={f} className={`btn btn-sm ${filterType === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterType(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          {filtersActive && <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Nullstill filtre</button>}
        </div>
      </div>

      {bulkMode && (
        <div className="card card-pad row flex-wrap" style={{ borderColor: 'var(--accent)' }}>
          <span className="text-mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{selectedIds.size} valgt</span>
          <select className="form-select" style={{ maxWidth: 220 }} value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
            <option value="">Velg kategori…</option>
            <optgroup label="Inntekt">
              {activeCategories.filter((c) => c.type === 'inntekt').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Utgift">
              {activeCategories.filter((c) => c.type === 'utgift').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          </select>
          <button className="btn btn-primary btn-sm" disabled={!bulkCategoryId || !selectedIds.size || bulkSaving} onClick={bulkSetCategory}>
            {bulkSaving ? 'Setter…' : `Sett kategori (${selectedIds.size})`}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!selectedIds.size || bulkSaving} onClick={bulkDelete}>Slett valgte</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set(filtered.map((t) => t.id)))}>Velg alle i visning ({filtered.length})</button>
          {selectedIds.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Fjern valg</button>}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Laster…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div>Ingen transaksjoner matcher filteret.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  {bulkMode && (
                    <th style={{ width: 32 }}>
                      <input type="checkbox" checked={filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(filtered.map((t) => t.id)) : new Set())} />
                    </th>
                  )}
                  <th>Dato</th>
                  <th>Beskrivelse</th>
                  <th>Konto</th>
                  <th>Eier</th>
                  <th>Kategori</th>
                  <th>Type</th>
                  <th className="text-right">Beløp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="list-row" style={selectedIds.has(t.id) ? { background: 'var(--surface-2)' } : undefined}>
                    {bulkMode && (
                      <td data-label="Velg"><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} /></td>
                    )}
                    <td data-label="Dato" className="text-muted">{formatDate(t.date)}</td>
                    <td className="list-primary">
                      {t.description}
                      {t.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{t.notes}</div>}
                    </td>
                    <td data-label="Konto" className="text-muted">{t.accounts?.display_name}</td>
                    <td data-label="Eier" className="text-muted">{t.profiles?.full_name}</td>
                    <td data-label="Kategori">
                      <select className="form-select-sm" value={t.category_id || ''} onChange={(e) => changeCategory(t, e.target.value)}>
                        <option value="">Ingen kategori</option>
                        {categoryOptionsFor(t.type, t.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td data-label="Type">
                      <span className={`badge ${t.type === 'inntekt' ? 'badge-green' : 'badge-neutral'}`}>{t.type}</span>
                    </td>
                    <td data-label="Beløp" className="text-right">
                      <span className={t.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>
                        {t.type === 'utgift' ? '−' : '+'}{formatKr(t.amount)}
                      </span>
                    </td>
                    <td data-label="">
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" title="Vis detaljer" onClick={() => setDetailTx(t)}>👁</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditItem(t); setShowModal(true) }}>Rediger</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteTransaction(t.id)}>Slett</button>
                      </div>
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
