import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { readFileAsText, parseBankCsv } from '../lib/bankCsv'
import { fetchActiveRules, matchAgainstRules, matchAgainstVendors, learnFromOutcome, extractVendorKey } from '../lib/categorize'
import { formatKr, formatDate } from '../lib/format'
import CategoryPicker from '../components/CategoryPicker'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

const SOURCE_LABELS = {
  rule: { label: 'Regel', badge: 'badge-accent' },
  vendor: { label: 'Leverandør', badge: 'badge-green' },
  ai: { label: 'AI', badge: 'badge-yellow' },
  manual: { label: 'Manuell', badge: 'badge-neutral' },
}

async function sha256(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Shows what the parser actually extracted for one row — the raw CSV line
// (or the raw AI-extracted JSON for a PDF import) alongside the parsed
// fields, so a surprising category/amount can be traced back to its source.
function RowDetailModal({ row, categoryName, onClose }) {
  const fields = [
    { label: 'Dato', value: formatDate(row.date) },
    { label: 'Beskrivelse', value: row.description },
    { label: 'Beløp', value: `${row.type === 'utgift' ? '−' : '+'}${formatKr(row.amount)}` },
    { label: 'Type', value: row.type === 'inntekt' ? 'Inntekt' : 'Utgift' },
    { label: 'Banktype', value: row.csvType || '—' },
    { label: 'Undertype', value: row.csvSubtype || '—' },
    { label: 'Melding / KID / Faktura', value: row.notes || '—' },
    { label: 'Søketekst (regelmatching)', value: row.matchText || row.description, mono: true },
    { label: 'Kategoriforslag', value: categoryName || '—' },
    { label: 'Kilde', value: SOURCE_LABELS[row.source]?.label || '—' },
    { label: 'Status', value: row.duplicate ? 'Duplikat' : 'Ny' },
  ]
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">Transaksjonsdata</div>
        <div className="stack" style={{ gap: 0, marginBottom: 'var(--space-4)' }}>
          {fields.map((f) => (
            <div key={f.label} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', gap: 'var(--space-3)' }}>
              <span className="text-muted" style={{ fontSize: 12, flexShrink: 0 }}>{f.label}</span>
              <span className={f.mono ? 'text-mono' : ''} style={{ fontSize: f.mono ? 12 : 13, textAlign: 'right', wordBreak: 'break-word' }}>{f.value}</span>
            </div>
          ))}
        </div>
        <div className="form-label">Rådata fra filen</div>
        <pre style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-3)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflowY: 'auto',
        }}>
          {row.raw || 'Ingen rådata tilgjengelig for denne raden.'}
        </pre>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Lukk</button>
        </div>
      </div>
    </div>
  )
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
  const [aiWarning, setAiWarning] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [detailRow, setDetailRow] = useState(null)
  const [vendorSuggestions, setVendorSuggestions] = useState([])
  const fileHashRef = useRef(null)
  const fileNameRef = useRef(null)
  const sourceRef = useRef('csv')
  const inputRef = useRef()

  useEffect(() => {
    supabase.from('accounts').select('*').eq('connection_type', 'manual').then(({ data }) => {
      setAccounts(data || [])
      const defaultAccount = (data || []).find((a) => a.is_default && a.owner_id === user?.id)
      if (defaultAccount) setAccountId(defaultAccount.id)
    })
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []))
  }, [household?.id])

  async function handleFile(file) {
    if (!accountId) { setError('Velg hvilken konto filen gjelder for først'); return }
    setError('')
    setStatus('Leser fil…')
    setRows([])
    setVendorSuggestions([])
    setDone(0)
    setBusy(true)

    try {
      const hash = await sha256(file)
      const { data: existingImport } = await supabase.from('bank_imports').select('id, imported_at').eq('file_hash', hash).maybeSingle()
      if (existingImport) {
        const proceed = window.confirm(`Denne filen er allerede importert (${formatDate(existingImport.imported_at)}). Importere på nytt?`)
        if (!proceed) { setBusy(false); return }
      }
      fileHashRef.current = hash
      fileNameRef.current = file.name

      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      sourceRef.current = isPdf ? 'pdf' : 'csv'
      let transactions = []
      let aiPresuggested = new Map()

      // Uttrekk (format-spesifikk): CSV parses lokalt, PDF tolkes av AI.
      // Kategorisering (identisk for begge, se under): regel → leverandør → AI.
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
        transactions = parsed.transactions.map((t) => ({ date: t.date, description: t.description, notes: '', amount: t.amount, type: t.type, raw: JSON.stringify(t, null, 2) }))
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
        const ruleHit = matchAgainstRules(rules, tx.matchText || tx.description, tx.type)
        const vendorHit = ruleHit ? null : await matchAgainstVendors(household.id, tx.description)
        const aiCategoryId = aiPresuggested.get(i) || null
        const source = ruleHit ? 'rule' : vendorHit ? 'vendor' : aiCategoryId ? 'ai' : null
        withLocalMatch.push({ ...tx, _id: i, selected: true, category_id: ruleHit?.categoryId || vendorHit?.categoryId || aiCategoryId, source })
      }

      // Samme AI-kategorisering for alt som ennå mangler kategori, uansett om
      // det kom fra CSV eller PDF — ingen forskjell i funksjonalitet mellom kildene.
      const unmatched = withLocalMatch.filter((t) => !t.category_id)
      setAiWarning('')
      if (unmatched.length > 0) {
        setStatus(`${withLocalMatch.length - unmatched.length} kategorisert av regler/leverandørhistorikk — spør AI om ${unmatched.length}…`)
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
            let aiFilled = 0
            for (const row of withLocalMatch) {
              if (!row.category_id && byId.has(row._id)) {
                const catId = byId.get(row._id)
                if (catId) { row.category_id = catId; row.source = 'ai'; aiFilled++ }
              }
            }
            if (aiFilled < unmatched.length) {
              setAiWarning(`AI foreslo kategori for ${aiFilled} av ${unmatched.length} usikre transaksjoner — resten var for uklare til å gjette på og må settes manuelt.`)
            }
          } else {
            const body = await res.json().catch(() => ({}))
            setAiWarning(`AI-kategorisering feilet (${body.error || `HTTP ${res.status}`}) — ${unmatched.length} transaksjoner mangler fortsatt kategori.`)
          }
        } catch (aiErr) {
          setAiWarning(`AI-kategorisering feilet (${aiErr.message}) — ${unmatched.length} transaksjoner mangler fortsatt kategori.`)
        }
      }

      // Startforslaget lagres uforanderlig per rad — brukes til å måle om
      // brukeren bekreftet eller overstyrte forslaget når importen godkjennes.
      for (const row of withLocalMatch) row.initial_category_id = row.category_id

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

      // Grupperer kategoriserte, ikke-duplikate rader per leverandør (samme
      // nøkkel som leverandørlæringen ellers bruker) og foreslår å legge dem
      // rett inn i leverandørregisteret — i stedet for å måtte vente på at
      // læringsløpet bygger opp den samme historikken transaksjon for transaksjon.
      const { data: knownVendors } = await supabase.from('vendors').select('normalized_name').eq('household_id', household.id)
      const knownKeys = new Set((knownVendors || []).map((v) => v.normalized_name))
      const vendorMap = new Map()
      for (const t of finalRows) {
        if (t.duplicate || !t.category_id) continue
        const key = extractVendorKey(t.description)
        if (key.length < 3 || knownKeys.has(key)) continue
        if (!vendorMap.has(key)) vendorMap.set(key, { key, suggested_category_id: t.category_id, transaction_count: 0, total_amount: 0 })
        const v = vendorMap.get(key)
        v.transaction_count++
        v.total_amount += Number(t.amount)
      }
      setVendorSuggestions([...vendorMap.values()].map((v, i) => ({ ...v, _id: i, include: v.transaction_count >= 2 })))
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

  function toggleAll(checked) {
    setRows((prev) => prev.map((r) => ({ ...r, selected: checked })))
  }

  function updateVendorSuggestion(id, field, value) {
    setVendorSuggestions((prev) => prev.map((v) => (v._id === id ? { ...v, [field]: value } : v)))
  }

  function handleDragOver(e) {
    e.preventDefault()
    if (!busy) setDragging(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setDragging(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
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
      source: sourceRef.current,
      bank_import_id: importRow?.id || null,
      raw_source: r.raw || null,
      bank_type: r.csvType || null,
      bank_subtype: r.csvSubtype || null,
    }))

    const { error } = await supabase.from('transactions').insert(payload)
    if (error) { setImporting(false); setError(error.message); return }

    // Leverandørforslag brukeren har krysset av legges rett inn i registeret —
    // et "ignoreDuplicates"-upsert er en ekstra sikring mot race conditions,
    // klientsiden har allerede filtrert bort kjente leverandører.
    const vendorsToSave = vendorSuggestions.filter((v) => v.include && v.key.trim())
    if (vendorsToSave.length > 0) {
      await supabase.from('vendors').upsert(
        vendorsToSave.map((v) => ({
          household_id: household.id,
          normalized_name: v.key.toLowerCase().trim(),
          suggested_category_id: v.suggested_category_id || null,
          transaction_count: v.transaction_count,
          confidence: 0.7,
          last_seen: new Date().toISOString().slice(0, 10),
        })),
        { onConflict: 'household_id,normalized_name', ignoreDuplicates: true }
      )
    }

    // Lær av hver rad: bekreftet forslag styrker leverandør-treffsikkerheten,
    // overstyrt forslag retter den — enten det kom fra regel, leverandørhistorikk eller AI.
    // Rader som akkurat ble dekket av et inkludert leverandørforslag hoppes over
    // her — statistikken deres er allerede satt av bulk-upserten over, og en
    // ekstra runde ville dobbelttalt transaction_count for hver av dem.
    const savedVendorKeys = new Set(vendorsToSave.map((v) => v.key.toLowerCase().trim()))
    const toLearnFrom = selected.filter((r) => !savedVendorKeys.has(extractVendorKey(r.description)))
    await Promise.all(toLearnFrom.map((r) => learnFromOutcome({
      householdId: household.id,
      description: r.description,
      suggestedCategoryId: r.initial_category_id || null,
      finalCategoryId: r.category_id || null,
    })))

    setImporting(false)
    setDone(selected.length)
    setRows([])
    setVendorSuggestions([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const selectedCount = rows.filter((r) => r.selected).length
  const allSelected = rows.length > 0 && selectedCount === rows.length
  const includedVendorCount = vendorSuggestions.filter((v) => v.include).length

  return (
    <div className="stack">
      {detailRow && (
        <RowDetailModal
          row={detailRow}
          categoryName={categories.find((c) => c.id === detailRow.category_id)?.name}
          onClose={() => setDetailRow(null)}
        />
      )}
      <div className="page-title">Importer kontoutskrift</div>

      <div className="card card-pad stack">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Konto</label>
          <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Velg konto…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name} ({a.institution}){a.is_default ? ' — standard' : ''}</option>)}
          </select>
        </div>

        <label
          className="row"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            justifyContent: 'center',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            background: dragging ? 'var(--accent-soft)' : 'transparent',
            transition: 'background 0.1s ease, border-color 0.1s ease',
          }}
        >
          <input ref={inputRef} type="file" accept=".csv,.txt,.pdf" disabled={busy} style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>📄 {dragging ? 'Slipp filen her' : 'Velg fil eller slipp den her'}</span>
        </label>
        <div className="text-muted" style={{ fontSize: 12 }}>
          CSV eksportert fra nettbanken (raskest, tolkes lokalt) eller PDF-kontoutskrift (tolkes av AI — brukes for kilder uten CSV-eksport, f.eks. SAS Mastercard/Nordnet). Begge kategoriseres på nøyaktig samme måte.
        </div>
      </div>

      {status && <div className="text-muted" style={{ fontSize: 13 }}>{status}</div>}
      {aiWarning && <div style={{ color: 'var(--yellow)', fontSize: 13 }}>⚠ {aiWarning}</div>}
      {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      {done > 0 && (
        <div className="card card-pad" style={{ color: 'var(--green)', fontWeight: 600 }}>✓ {done} transaksjoner importert.</div>
      )}

      {rows.length > 0 && (
        <>
          <div className="card">
            <div className="table-wrap">
              <table className="list-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && !allSelected }}
                        onChange={(e) => toggleAll(e.target.checked)}
                        title={allSelected ? 'Velg ingen' : 'Velg alle'}
                      />
                    </th>
                    <th>Dato</th>
                    <th>Beskrivelse</th>
                    <th className="text-right">Beløp</th>
                    <th>Kategori</th>
                    <th style={{ width: 44 }} />
                    <th>Kilde</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id} className="list-row" style={{ opacity: r.selected ? 1 : 0.4 }}>
                      <td data-label="Velg"><input type="checkbox" checked={r.selected} onChange={(e) => updateRow(r._id, 'selected', e.target.checked)} /></td>
                      <td data-label="Dato" className="text-muted">{formatDate(r.date)}</td>
                      <td className="list-primary">
                        {r.description}
                        {r.duplicate && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>duplikat</span>}
                        {(r.csvType || r.csvSubtype) && (
                          <div className="row" style={{ gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                            {r.csvType && <span className="badge badge-neutral" style={{ fontSize: 10 }}>{r.csvType}</span>}
                            {r.csvSubtype && <span className="badge badge-neutral" style={{ fontSize: 10 }}>{r.csvSubtype}</span>}
                          </div>
                        )}
                      </td>
                      <td data-label="Beløp" className="text-right">
                        <span className={r.type === 'inntekt' ? 'amount-positive' : 'amount-negative'}>{r.type === 'utgift' ? '−' : '+'}{formatKr(r.amount)}</span>
                      </td>
                      <td data-label="Kategori">
                        <select className="form-select-sm" value={r.category_id || ''} onChange={(e) => {
                          updateRow(r._id, 'category_id', e.target.value || null)
                          updateRow(r._id, 'source', e.target.value ? 'manual' : null)
                        }}>
                          <option value="">Ingen</option>
                          {categories.filter((c) => c.type === r.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td data-label="" style={{ textAlign: 'center' }}>
                        <button type="button" className="btn btn-ghost btn-icon-sm" title="Vis parsede data" onClick={() => setDetailRow(r)}>👁</button>
                      </td>
                      <td data-label="Kilde">
                        {SOURCE_LABELS[r.source] && (
                          <span className={`badge ${SOURCE_LABELS[r.source].badge}`}>{SOURCE_LABELS[r.source].label}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {vendorSuggestions.length > 0 && (
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <div className="row">
                <span className="section-title" style={{ marginBottom: 0 }}>Nye leverandørforslag</span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {includedVendorCount} av {vendorSuggestions.length} inkludert — legges til leverandørregisteret
                </span>
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table className="list-table">
                    <thead>
                      <tr>
                        <th>
                          <input type="checkbox" checked={vendorSuggestions.every((v) => v.include)}
                            onChange={(e) => setVendorSuggestions((prev) => prev.map((v) => ({ ...v, include: e.target.checked })))} />
                        </th>
                        <th>Leverandørnavn</th>
                        <th>Kategori</th>
                        <th className="text-right">Transaksjoner</th>
                        <th className="text-right">Totalt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorSuggestions.map((v) => (
                        <tr key={v._id} className="list-row" style={{ opacity: v.include ? 1 : 0.4 }}>
                          <td data-label="Velg"><input type="checkbox" checked={v.include} onChange={(e) => updateVendorSuggestion(v._id, 'include', e.target.checked)} /></td>
                          <td data-label="Leverandørnavn">
                            <input className="form-input" style={{ minHeight: 32, fontSize: 13, padding: '0 var(--space-2)' }}
                              value={v.key} onChange={(e) => updateVendorSuggestion(v._id, 'key', e.target.value)} />
                          </td>
                          <td data-label="Kategori" style={{ minWidth: 180 }}>
                            <CategoryPicker categories={categories} value={v.suggested_category_id || ''}
                              onChange={(id) => updateVendorSuggestion(v._id, 'suggested_category_id', id)} />
                          </td>
                          <td data-label="Transaksjoner" className="text-right text-mono">{v.transaction_count}</td>
                          <td data-label="Totalt" className="text-right text-mono">{formatKr(v.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="row">
            <button className="btn btn-ghost grow" onClick={() => { setRows([]); setVendorSuggestions([]); setStatus(''); setDone(0); if (inputRef.current) inputRef.current.value = '' }}>
              Avbryt
            </button>
            <button className="btn btn-primary grow" disabled={importing || selectedCount === 0} onClick={commitImport}>
              {importing ? 'Importerer…' : `Importer ${selectedCount} transaksjoner${includedVendorCount > 0 ? ` + ${includedVendorCount} leverandører` : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
