import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Onboarding() {
  const { user, refreshHousehold } = useAuth()
  const [mode, setMode] = useState('create')
  const [fullName, setFullName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.rpc('create_household', {
        household_name: householdName.trim(),
        p_full_name: fullName.trim(),
      })
      if (error) throw error
      await refreshHousehold()
    } catch (err) {
      setError(err.message || 'Kunne ikke opprette husstand')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.rpc('accept_household_invite', {
        p_token: inviteToken.trim(),
        p_full_name: fullName.trim(),
      })
      if (error) throw error
      await refreshHousehold()
    } catch (err) {
      setError(err.message || 'Ugyldig eller utløpt invitasjon')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ padding: 32, width: 400 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Velkommen, {user?.email}</div>

        <div className="flex" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={`btn ${mode === 'create' ? 'btn-primary' : ''}`} onClick={() => setMode('create')}>
            Opprett husstand
          </button>
          <button className={`btn ${mode === 'join' ? 'btn-primary' : ''}`} onClick={() => setMode('join')}>
            Bli med i husstand
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreate}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Ditt navn</label>
            <input className="form-input" required value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ marginBottom: 12, marginTop: 4 }} />
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Navn på husstanden</label>
            <input className="form-input" required placeholder="F.eks. Familien Bøe" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} style={{ marginBottom: 16, marginTop: 4 }} />
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Oppretter…' : 'Opprett'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Ditt navn</label>
            <input className="form-input" required value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ marginBottom: 12, marginTop: 4 }} />
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Invitasjonskode</label>
            <input className="form-input" required value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} style={{ marginBottom: 16, marginTop: 4 }} />
            {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Blir med…' : 'Bli med'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
