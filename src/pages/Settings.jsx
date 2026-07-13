import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Settings() {
  const { household, members, profile } = useAuth()
  const [invite, setInvite] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function createInvite(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_household_invite', {
      p_household_id: household.id,
      p_email: inviteEmail.trim() || null,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    setInvite(data)
  }

  return (
    <div>
      <h2>Innstillinger</h2>

      <div className="card" style={{ padding: 16, marginBottom: 16, maxWidth: 480 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{household?.name}</div>
        <table>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>{m.profiles?.full_name}{m.user_id === profile?.id ? ' (deg)' : ''}</td>
                <td className="text-muted">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 16, maxWidth: 480 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Inviter samboer</div>
        <form onSubmit={createInvite} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="form-input" type="email" placeholder="E-post (valgfritt, låser invitasjonen til denne adressen)"
            value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Lager…' : 'Lag kode'}</button>
        </form>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        {invite && (
          <div style={{ fontSize: 13 }}>
            Del denne koden — den brukes én gang og utløper om 7 dager:
            <div className="text-mono" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 6, marginTop: 6, wordBreak: 'break-all' }}>
              {invite}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
