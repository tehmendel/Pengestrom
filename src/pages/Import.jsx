import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { readFileAsText, parseBankCsv } from '../lib/bankCsv'
import { fetchActiveRules, matchAgainstRules, matchAgainstVendors } from '../lib/categorize'
import { formatKr } from '../lib/format'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

async function sha256(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function Import() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [categories, setCategories] = useState([])
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(0)
  const fileHashRef = useRef(null)
  const fileNameRef = useRef(null)
  const inputRef = useRef()

  useEffect(() => {
    supabase.from('accounts').select('*').eq('connection_type', 'manual').then(({ data }) => setAccounts(data || []))
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []))
  }, [household?.id])

  async function handleFile(file) {
    if (!accountId) { setError('Velg hvilken konto filen gjelder for først'); return }
    setError('')
    setStatus('Leser fil…')
    setRows([])
    setDone(0)
    setBusy(true)

    try {
      const hash = await sha256(file)
      const { data: existingImport } = await supabase.from('bank_imports').select('id, imported_at').eq('file_hash', hash).maybeSingle()
      if (existingImport) {
        const proceed = window.confirm(`Denne filen er allerede importert (${new Date(existingImport.imported_at).toLocaleDateString('nb-NO')}). Importere på nytt?`)
        if (!proceed) { setBusy(false); return }
      }
      fileHashRef.current = hash
      fileNameRef.current = file.name

      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      let transactions = []
      let aiPresuggested = new Map()

      if (isPdf) {
        setStatus('Sender til AI for tolkning (kan ta et minutt)…')
        const { data: { session } } = await supabase.auth.getSession()
        const formData = new FormData()
        formData.append('file', file)
        formData.append('categories', JSON.stringify(categories))
        const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-bank-statement`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Serverfeil (${res.status})`)
        }
        const parsed = await res.json()
        transactions = parsed.transactions.map((t) => ({ date: t.date, description: t.description, notes: '', amount: t.amount, type: t.type }))
        aiPresuggested = new Map(parsed.transactions.map((t, i) => [i, t.category_id]))
      } else {
        const text = await readFileAsText(file)
        const { transactions: parsedCsv, error: parseError } = parseBankCsv(text)
        if (parseError) throw new Error(parseError)
        transactions = parsedCsv
      }
      if (transactions.length === 0) throw new Error('Fant ingen transaksjoner i filen')

      setStatus(`Fant ${transactions.length} transaksjoner — kategoriserer…`)
      const rules = await fetchActiveRules(household.id)

      const withLocalMatch = []
      for (const [i, tx] of transactions.entries()) {
        const ruleHit = matchAgainstRules(rules, tx.description, tx.type)
        const vendorHit = ruleHit ? null : await matchAgainstVendors(household.id, tx.description)
        withLocalMatch.push({ ...tx, _id: i, selected: true, category_id: ruleHit?.categoryId || vendorHit?.categoryId || aiPresuggested.get(i) || null })
      }

      const unmatched = withLocalMatch.filter((t) => !t.category_id)
      if (!isPdf && unmatched.length > 0) {
        setStatus(`${withLocalMatch.length - unmatched.length} kategorisert av regler — spør AI om ${unmatched.length}…`)
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const res = await fetch(`${SUPABASE_URL}/functions/v1/categorize-transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              transactions: unmatched.map((t) => ({ id: t._id, description: t.description, type: t.type })),
              categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
            }),
          })
          if (res.ok) {
            const { suggestions } = await res.json()
            const byId = new Map(suggestions.map((s) => [s.id, s.category_id]))
            for (const row of withLocalMatch) {
              if (!row.category_id && byId.has(row._id)) row.category_id = byId.get(row._id)
            }
          }
        } catch {
          // AI-kategorisering feilet — fortsetter med det regelbasert matching fant
        }
      }

      setStatus('Sjekker duplikater…')
      const dates = withLocalMatch.map((t) => t.date).sort()
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('date, amount, type, description')
        .eq('account_id', accountId)
        .gte('date', dates[0])
        .lte('date', dates[dates.length - 1])

      const existingKeys = new Set((existingTx || []).map((t) => `${t.date}|${Math.round(Number(t.amount) * 100)}|${t.type}`))
      const finalRows = withLocalMatch.map((t) => {
        const key = `${t.date}|${Math.round(t.amount * 100)}|${t.type}`
        return existingKeys.has(key) ? { ...t, selected: false, duplicate: true } : t
      })

      setRows(finalRows)
      setStatus(`Klar til gjennomgang — ${finalRows.filter((r) => !r.duplicate).length} nye, ${finalRows.filter((r) => r.duplicate).length} duplikater avhuket`)
    } catch (err) {
      setError(err.message || 'Noe gikk galt under lesing av filen')
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  function updateRow(id, field, value) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)))
  }

  async function commitImport() {
    setImporting(true)
    const selected = rows.filter((r) => r.selected)

    const { data: importRow } = await supabase.from('bank_imports').upsert({
      account_id: accountId,
      file_hash: fileHashRef.current,
      filename: fileNameRef.current,
      imported_by: user.id,
      transaction_count: selected.length,
    }, { onConflict: 'file_hash' }).select('id').single()

    const payload = selected.map((r) => ({
      account_id: accountId,
      household_id: household.id,
      owner_id: user.id,
      date: r.date,
      description: r.description,
      notes: r.notes || '',
      amount: r.amount,
      type: r.type,
      category_id: r.category_id || null,
      source: 'csv',
      bank_import_id: importRow?.id || null,
    }))

    const { error } = await supabase.from('transactions').insert(payload)
    setImporting(false)
    if (error) { setError(error.message); return }
    setDone(selected.length)
    setRows([])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <h2>Importer kontoutskrift</h2>

      <div className="card" style={{ padding: 16, marginBottom: 16, maxWidth: 480 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Konto</label>
        <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ marginBottom: 12, marginTop: 4 }}>
          <option value="">Velg konto…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name} ({a.institution})</option>)}
        </select>
        <input ref={inputRef} type="file" accept=".csv,.txt,.pdf" disabled={busy}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          CSV eksportert fra nettbanken (raskest, tolkes lokalt) eller PDF-kontoutskrift (tolkes av AI — brukes for kilder uten CSV-eksport, f.eks. SAS Mastercard/Nordnet).
        </div>
      </div>

      {status && <div className="text-muted" style={{ marginBottom: 12 }}>{status}</div>}
      {error && <div style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>}
      {done > 0 && <div className="card" style={{ padding: 16, marginBottom: 16, color: 'var(--green)' }}>{done} transaksjoner importert.</div>}

      {rows.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Dato</th>
                  <th>Beskrivelse</th>
                  <th className="text-right">Beløp</th>
                  <th>Kategori</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} style={{ opacity: r.selected ? 1 : 0.4 }}>
                    <td><input type="checkbox" checked={r.selected} onChange={(e) => updateRow(r._id, 'selected', e.target.checked)} /></td>
                    <td className="text-muted">{r.date}</td>
                    <td>{r.description} {r.duplicate && <span style={{ fontSize: 10, background: 'var(--yellow)', color: '#000', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>duplikat</span>}</td>
                    <td className="text-right">
                      <span className={r.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>{r.type === 'utgift' ? '−' : '+'}{formatKr(r.amount)}</span>
                    </td>
                    <td>
                      <select className="form-select" value={r.category_id || ''} onChange={(e) => updateRow(r._id, 'category_id', e.target.value || null)}>
                        <option value="">Ingen</option>
                        {categories.filter((c) => c.type === r.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" disabled={importing || rows.filter((r) => r.selected).length === 0} onClick={commitImport}>
            {importing ? 'Importerer…' : `Importer ${rows.filter((r) => r.selected).length} transaksjoner`}
          </button>
        </>
      )}
    </div>
  )
}
