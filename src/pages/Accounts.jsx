import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Brukskonto' },
  { value: 'savings', label: 'Sparekonto' },
  { value: 'loan', label: 'Lån' },
  { value: 'card', label: 'Kredittkort' },
  { value: 'investment', label: 'Fond/aksjer' },
  { value: 'child', label: 'Barnekonto' },
]

export default function Accounts() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ institution: '', account_type: 'checking', display_name: '', visibility: 'personal' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('*, profiles:owner_id(full_name)')
      .order('created_at', { ascending: true })
    setAccounts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('accounts').insert({
      household_id: household.id,
      owner_id: user.id,
      institution: form.institution.trim(),
      account_type: form.account_type,
      display_name: form.display_name.trim(),
      visibility: form.visibility,
      connection_type: 'manual',
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setForm({ institution: '', account_type: 'checking', display_name: '', visibility: 'personal' })
    setShowForm(false)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Kontoer</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Avbryt' : '+ Legg til konto'}
        </button>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
        Automatisk bankkobling med BankID (Enable Banking) er under utprøving — se status i README. Inntil videre
        legger du til kontoer manuelt her og importerer kontoutskrift under «Importer».
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="card" style={{ padding: 16, marginBottom: 16, display: 'grid', gap: 10, maxWidth: 420 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Bank/leverandør</label>
            <input className="form-input" required placeholder="F.eks. Rogaland Sparebank" value={form.institution}
              onChange={(e) => setForm({ ...form, institution: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Visningsnavn</label>
            <input className="form-input" required placeholder="F.eks. Brukskonto" value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Type</label>
            <select className="form-select" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Synlighet i husstanden</label>
            <select className="form-select" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
              <option value="personal">Personlig (kun kategorisummer deles)</option>
              <option value="shared">Felles (full detalj synlig for husstanden)</option>
            </select>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Lagrer…' : 'Lagre konto'}</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Konto</th>
              <th>Bank</th>
              <th>Type</th>
              <th>Eier</th>
              <th>Synlighet</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-muted">Laster…</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={5} className="text-muted">Ingen kontoer lagt til ennå.</td></tr>
            ) : accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.display_name}</td>
                <td>{a.institution}</td>
                <td>{ACCOUNT_TYPES.find((t) => t.value === a.account_type)?.label || a.account_type}</td>
                <td className="text-muted">{a.profiles?.full_name || '—'}</td>
                <td>{a.visibility === 'shared' ? 'Felles' : 'Personlig'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
