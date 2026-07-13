import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      await signInWithEmail(email.trim())
      setSent(true)
    } catch (err) {
      setError(err.message || 'Kunne ikke sende innloggingslenke')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ padding: 32, width: 360 }}>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Økonomiportalen</div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
          Logg inn med e-post — ingen passord å huske.
        </div>
        {sent ? (
          <div style={{ fontSize: 14 }}>
            Sjekk innboksen din på <strong>{email}</strong> — trykk på lenken der for å logge inn.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              className="form-input"
              type="email"
              required
              placeholder="din@epost.no"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            {error && (
              <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}
            <button className="btn btn-primary" type="submit" disabled={sending} style={{ width: '100%' }}>
              {sending ? 'Sender…' : 'Send innloggingslenke'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
