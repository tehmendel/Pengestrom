import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr } from '../lib/format'

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Brukskonto' },
  { value: 'savings', label: 'Sparekonto' },
  { value: 'loan', label: 'Lån' },
  { value: 'card', label: 'Kredittkort' },
  { value: 'investment', label: 'Fond/aksjer' },
  { value: 'child', label: 'Barnekonto' },
]

const ASSET_CATEGORIES = [
  { value: 'property', label: 'Bolig', isLiability: false },
  { value: 'vehicle', label: 'Kjøretøy', isLiability: false },
  { value: 'pension', label: 'Pensjon', isLiability: false },
  { value: 'other_asset', label: 'Annen eiendel', isLiability: false },
  { value: 'other_debt', label: 'Annen gjeld', isLiability: true },
]

function AssetsCard() {
  const { household, user } = useAuth()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'property', value: '', visibility: 'personal' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('assets').select('*').order('created_at', { ascending: true })

    // assets.owner_id and profiles.id both reference auth.users(id)
    // independently, so PostgREST can't embed profiles directly — fetch and merge instead.
    const ownerIds = [...new Set((data || []).map((a) => a.owner_id))]
    const { data: profiles } = ownerIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', ownerIds)
      : { data: [] }
    const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]))

    setAssets((data || []).map((a) => ({ ...a, profiles: profileById[a.owner_id] || null })))
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim() || form.value === '') return
    setSaving(true)
    setError('')
    const meta = ASSET_CATEGORIES.find((c) => c.value === form.category)
    const { error } = await supabase.from('assets').insert({
      household_id: household.id,
      owner_id: user.id,
      name: form.name.trim(),
      category: form.category,
      value: Number(form.value),
      is_liability: meta.isLiability,
      visibility: form.visibility,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setForm({ name: '', category: 'property', value: '', visibility: 'personal' })
    setShowForm(false)
    load()
  }

  async function saveValue(id) {
    const { error } = await supabase.from('assets').update({ value: Number(editValue), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingId(null)
    load()
  }

  async function remove(id) {
    if (!window.confirm('Fjerne denne eiendelen/gjelden?')) return
    await supabase.from('assets').delete().eq('id', id)
    load()
  }

  return (
    <div className="stack">
      <div className="row-between">
        <div className="section-title">Eiendeler og gjeld</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Avbryt' : '+ Legg til'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="card card-pad">
          <div className="form-group">
            <label className="form-label">Navn</label>
            <input className="form-input" required placeholder="F.eks. Boligen, Bilen, Studielån" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {ASSET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Verdi (kr)</label>
            <input className="form-input" required type="number" min="0" step="1" value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Synlighet i husstanden</label>
            <select className="form-select" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
              <option value="personal">Personlig (kun i formuesummer)</option>
              <option value="shared">Felles (full detalj synlig for husstanden)</option>
            </select>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Lagrer…' : 'Lagre'}</button>
        </form>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Laster…</div>
        ) : assets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏡</div>
            <div>Ingen eiendeler eller gjeld registrert ennå.</div>
          </div>
        ) : assets.map((a) => {
          const meta = ASSET_CATEGORIES.find((c) => c.value === a.category)
          return (
            <div key={a.id} className="row-between" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{meta?.label} · {a.profiles?.full_name}</div>
              </div>
              <div className="row">
                {editingId === a.id ? (
                  <>
                    <input className="form-input" style={{ width: 130 }} type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={() => saveValue(a.id)}>Lagre</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Avbryt</button>
                  </>
                ) : (
                  <>
                    <span className={a.is_liability ? 'amount-negative' : 'amount-positive'} style={{ fontWeight: 600 }}>
                      {a.is_liability ? '−' : ''}{formatKr(a.value)}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(a.id); setEditValue(String(a.value)) }}>Rediger</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(a.id)}>Fjern</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const VISIBILITY_OPTIONS = [
  { value: 'alle', label: 'Alle' },
  { value: 'shared', label: 'Felles' },
  { value: 'personal', label: 'Personlig' },
]

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Nyeste først' },
  { value: 'created_asc', label: 'Eldste først' },
  { value: 'name_asc', label: 'Navn (A-Å)' },
  { value: 'name_desc', label: 'Navn (Å-A)' },
  { value: 'balance_desc', label: 'Saldo (høy-lav)' },
  { value: 'balance_asc', label: 'Saldo (lav-høy)' },
]

const emptyAccountForm = { institution: '', account_type: 'checking', display_name: '', visibility: 'personal', balance: '' }

export default function Accounts() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyAccountForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editingBalanceId, setEditingBalanceId] = useState(null)
  const [balanceValue, setBalanceValue] = useState('')
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState('alle')
  const [filterVisibility, setFilterVisibility] = useState('alle')
  const [sortBy, setSortBy] = useState('created_desc')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true })
    setAccounts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  function startAdd() {
    setForm(emptyAccountForm)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  function startEdit(a) {
    setForm({
      institution: a.institution,
      account_type: a.account_type,
      display_name: a.display_name,
      visibility: a.visibility,
      balance: a.balance != null ? String(a.balance) : '',
    })
    setEditingId(a.id)
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.institution.trim() || !form.display_name.trim()) return
    setSaving(true)
    setError('')

    const payload = {
      institution: form.institution.trim(),
      account_type: form.account_type,
      display_name: form.display_name.trim(),
      visibility: form.visibility,
      balance: form.balance === '' ? null : Number(form.balance),
    }

    const { error } = editingId
      ? await supabase.from('accounts').update(payload).eq('id', editingId)
      : await supabase.from('accounts').insert({ ...payload, household_id: household.id, owner_id: user.id, connection_type: 'manual' })

    setSaving(false)
    if (error) { setError(error.message); return }
    setShowForm(false)
    setForm(emptyAccountForm)
    setEditingId(null)
    load()
  }

  async function saveBalance(id) {
    const { error } = await supabase.from('accounts').update({ balance: balanceValue === '' ? null : Number(balanceValue) }).eq('id', id)
    if (error) { setError(error.message); return }
    setEditingBalanceId(null)
    load()
  }

  async function removeAccount(account) {
    setError('')
    const [{ count: txCount }, { count: holdingCount }] = await Promise.all([
      supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', account.id),
      supabase.from('holdings').select('id', { count: 'exact', head: true }).eq('account_id', account.id),
    ])
    const parts = []
    if (txCount) parts.push(`${txCount} transaksjon${txCount === 1 ? '' : 'er'}`)
    if (holdingCount) parts.push(`${holdingCount} beholdning${holdingCount === 1 ? '' : 'er'}`)
    const message = parts.length
      ? `Kontoen «${account.display_name}» har ${parts.join(' og ')} knyttet til seg. Sletter du kontoen, slettes disse også. Dette kan ikke angres. Fortsette?`
      : `Fjerne kontoen «${account.display_name}»?`
    if (!window.confirm(message)) return
    const { error } = await supabase.from('accounts').delete().eq('id', account.id)
    if (error) { setError(error.message); return }
    load()
  }

  const filtered = accounts
    .filter((a) => filterType === 'alle' || a.account_type === filterType)
    .filter((a) => filterVisibility === 'alle' || a.visibility === filterVisibility)

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'name_asc': return a.display_name.localeCompare(b.display_name, 'nb')
      case 'name_desc': return b.display_name.localeCompare(a.display_name, 'nb')
      case 'balance_desc': return (Number(b.balance) || 0) - (Number(a.balance) || 0)
      case 'balance_asc': return (Number(a.balance) || 0) - (Number(b.balance) || 0)
      case 'created_asc': return a.created_at.localeCompare(b.created_at)
      default: return b.created_at.localeCompare(a.created_at)
    }
  })

  const totalBalance = filtered.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-title">Kontoer</div>
        <button className="btn btn-primary btn-sm" onClick={showForm ? () => setShowForm(false) : startAdd}>
          {showForm ? 'Avbryt' : '+ Legg til'}
        </button>
      </div>

      <div className="card card-pad" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Automatisk bankkobling med BankID (Enable Banking) er under utprøving. Inntil videre legger du til kontoer
        manuelt her, importerer kontoutskrift under «Importer», og oppdaterer saldo selv innimellom.
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card card-pad">
          <div className="form-group">
            <label className="form-label">Bank/leverandør</label>
            <input className="form-input" required placeholder="F.eks. Rogaland Sparebank" value={form.institution}
              onChange={(e) => setForm({ ...form, institution: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Visningsnavn</label>
            <input className="form-input" required placeholder="F.eks. Brukskonto" value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Saldo (kr)</label>
            <input className="form-input" type="number" step="any" placeholder="Valgfritt" value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Synlighet i husstanden</label>
            <select className="form-select" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
              <option value="personal">Personlig (kun kategorisummer deles)</option>
              <option value="shared">Felles (full detalj synlig for husstanden)</option>
            </select>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Lagrer…' : editingId ? 'Lagre endringer' : 'Lagre konto'}</button>
        </form>
      )}

      {!loading && accounts.length > 0 && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <div className="row flex-wrap">
            <button className={`chip ${filterType === 'alle' ? 'active' : ''}`} onClick={() => setFilterType('alle')}>Alle typer</button>
            {ACCOUNT_TYPES.map((t) => (
              <button key={t.value} className={`chip ${filterType === t.value ? 'active' : ''}`} onClick={() => setFilterType(t.value)}>{t.label}</button>
            ))}
          </div>
          <div className="row-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <div className="row flex-wrap">
              {VISIBILITY_OPTIONS.map((v) => (
                <button key={v.value} className={`chip ${filterVisibility === v.value ? 'active' : ''}`} onClick={() => setFilterVisibility(v.value)}>{v.label}</button>
              ))}
            </div>
            <select className="form-select" style={{ width: 'auto' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="card card-pad">
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <span className="icon-chip icon-chip-blue">🏦</span>
            <span className="stat-label">Totalt (etter filter)</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatKr(totalBalance)}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>{filtered.length} konto{filtered.length === 1 ? '' : 'er'}</div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Laster…</div>
        ) : accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏦</div>
            <div>Ingen kontoer lagt til ennå.</div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty-state">Ingen kontoer matcher filteret.</div>
        ) : (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th>Konto</th>
                  <th>Bank</th>
                  <th>Type</th>
                  <th className="text-right">Saldo</th>
                  <th>Synlighet</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id} className="list-row">
                    <td className="list-primary">{a.display_name}</td>
                    <td data-label="Bank" className="text-secondary">{a.institution}</td>
                    <td data-label="Type" className="text-secondary">{ACCOUNT_TYPES.find((t) => t.value === a.account_type)?.label || a.account_type}</td>
                    <td data-label="Saldo" className="text-right">
                      {editingBalanceId === a.id ? (
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <input className="form-input" style={{ width: 120 }} type="number" value={balanceValue}
                            onChange={(e) => setBalanceValue(e.target.value)} autoFocus />
                          <button className="btn btn-primary btn-sm" onClick={() => saveBalance(a.id)}>Lagre</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditingBalanceId(a.id); setBalanceValue(a.balance != null ? String(a.balance) : '') }}>
                          {a.balance != null ? formatKr(a.balance) : 'Sett saldo'}
                        </button>
                      )}
                    </td>
                    <td data-label="Synlighet">
                      <span className={`badge ${a.visibility === 'shared' ? 'badge-accent' : 'badge-neutral'}`}>
                        {a.visibility === 'shared' ? 'Felles' : 'Personlig'}
                      </span>
                    </td>
                    <td data-label="">
                      <div className="row">
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(a)}>Rediger</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeAccount(a)}>Slett</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AssetsCard />
    </div>
  )
}
