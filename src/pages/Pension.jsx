import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr, formatDate } from '../lib/format'
import { PENSION_INSTRUMENT_TYPE } from '../lib/constants'

const emptyAccountForm = {
  provider: 'Storebrand', display_name: '', agreement_number: '', employer: '',
  employment_date: '', annual_salary: '', position_percentage: '', savings_percentage: '',
  additional_savings_percentage: '', payout_start_date: '', payout_end_date: '',
  policyholder: '', insured: '', admin_fee_note: '', accrued_current_employer: '',
  accrued_former_employer: '', management_fee_note: '', visibility: 'personal',
}

const emptyHoldingForm = { instrument_name: '', isin: '', quantity: '', current_price: '' }

function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  )
}

export default function Pension() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [holdings, setHoldings] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)

  const [showAccountForm, setShowAccountForm] = useState(false)
  const [accountForm, setAccountForm] = useState(emptyAccountForm)
  const [editingAccountId, setEditingAccountId] = useState(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountError, setAccountError] = useState('')

  const [holdingFormFor, setHoldingFormFor] = useState(null)
  const [holdingForm, setHoldingForm] = useState(emptyHoldingForm)
  const [savingHolding, setSavingHolding] = useState(false)
  const [holdingError, setHoldingError] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [fetchNote, setFetchNote] = useState('')

  // For avtaler uten fondsbeholdning (NAV/SPK-type poengbasert pensjon har ingen
  // andeler/kurs å regne verdi fra) — logger et rent kr-tall som snapshot direkte.
  const [manualFormFor, setManualFormFor] = useState(null)
  const [manualValue, setManualValue] = useState('')
  const [savingManual, setSavingManual] = useState(false)
  const [manualError, setManualError] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: accs }, { data: hlds }] = await Promise.all([
      supabase.from('pension_accounts').select('*').order('created_at', { ascending: true }),
      supabase.from('holdings').select('*').not('pension_account_id', 'is', null),
    ])
    setAccounts(accs || [])
    setHoldings(hlds || [])

    const accIds = (accs || []).map((a) => a.id)
    if (accIds.length > 0) {
      const { data: snaps } = await supabase
        .from('pension_value_snapshots')
        .select('pension_account_id, snapshot_date, value')
        .in('pension_account_id', accIds)
        .order('snapshot_date', { ascending: true })
      setSnapshots(snaps || [])
    } else {
      setSnapshots([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  function startAddAccount() {
    setAccountForm(emptyAccountForm)
    setEditingAccountId(null)
    setAccountError('')
    setShowAccountForm(true)
  }

  function startEditAccount(a) {
    setAccountForm({
      provider: a.provider || 'Storebrand',
      display_name: a.display_name || '',
      agreement_number: a.agreement_number || '',
      employer: a.employer || '',
      employment_date: a.employment_date || '',
      annual_salary: a.annual_salary != null ? String(a.annual_salary) : '',
      position_percentage: a.position_percentage != null ? String(a.position_percentage) : '',
      savings_percentage: a.savings_percentage != null ? String(a.savings_percentage) : '',
      additional_savings_percentage: a.additional_savings_percentage != null ? String(a.additional_savings_percentage) : '',
      payout_start_date: a.payout_start_date || '',
      payout_end_date: a.payout_end_date || '',
      policyholder: a.policyholder || '',
      insured: a.insured || '',
      admin_fee_note: a.admin_fee_note || '',
      accrued_current_employer: a.accrued_current_employer != null ? String(a.accrued_current_employer) : '',
      accrued_former_employer: a.accrued_former_employer != null ? String(a.accrued_former_employer) : '',
      management_fee_note: a.management_fee_note || '',
      visibility: a.visibility,
    })
    setEditingAccountId(a.id)
    setAccountError('')
    setShowAccountForm(true)
  }

  async function handleAccountSubmit(e) {
    e.preventDefault()
    if (!accountForm.display_name.trim()) return
    setSavingAccount(true)
    setAccountError('')

    const numOrNull = (v) => (v === '' ? null : Number(v))
    const dateOrNull = (v) => (v === '' ? null : v)

    const payload = {
      provider: accountForm.provider.trim() || 'Storebrand',
      display_name: accountForm.display_name.trim(),
      agreement_number: accountForm.agreement_number.trim() || null,
      employer: accountForm.employer.trim() || null,
      employment_date: dateOrNull(accountForm.employment_date),
      annual_salary: numOrNull(accountForm.annual_salary),
      position_percentage: numOrNull(accountForm.position_percentage),
      savings_percentage: numOrNull(accountForm.savings_percentage),
      additional_savings_percentage: numOrNull(accountForm.additional_savings_percentage),
      payout_start_date: dateOrNull(accountForm.payout_start_date),
      payout_end_date: dateOrNull(accountForm.payout_end_date),
      policyholder: accountForm.policyholder.trim() || null,
      insured: accountForm.insured.trim() || null,
      admin_fee_note: accountForm.admin_fee_note.trim() || null,
      accrued_current_employer: numOrNull(accountForm.accrued_current_employer),
      accrued_former_employer: numOrNull(accountForm.accrued_former_employer),
      management_fee_note: accountForm.management_fee_note.trim() || null,
      visibility: accountForm.visibility,
    }

    const { error } = editingAccountId
      ? await supabase.from('pension_accounts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingAccountId)
      : await supabase.from('pension_accounts').insert({ ...payload, household_id: household.id, owner_id: user.id })

    setSavingAccount(false)
    if (error) { setAccountError(error.message); return }
    setShowAccountForm(false)
    setAccountForm(emptyAccountForm)
    setEditingAccountId(null)
    load()
  }

  async function removeAccount(id) {
    if (!window.confirm('Slette denne pensjonsavtalen? Fondsbeholdning og verdihistorikk slettes også.')) return
    await supabase.from('pension_accounts').delete().eq('id', id)
    load()
  }

  function startAddHolding(pensionAccountId) {
    setHoldingForm(emptyHoldingForm)
    setHoldingError('')
    setFetchNote('')
    setManualFormFor(null)
    setHoldingFormFor(pensionAccountId)
  }

  function startEditHolding(h) {
    setHoldingForm({
      instrument_name: h.instrument_name,
      isin: h.isin || '',
      quantity: String(h.quantity),
      current_price: String(h.current_price),
    })
    setHoldingError('')
    setFetchNote('')
    setManualFormFor(null)
    setHoldingFormFor(h.pension_account_id)
  }

  function startManualUpdate(pensionAccountId, currentValue) {
    setManualValue(currentValue ? String(currentValue) : '')
    setManualError('')
    setHoldingFormFor(null)
    setManualFormFor(pensionAccountId)
  }

  async function handleManualSubmit(e) {
    e.preventDefault()
    if (!manualFormFor) return
    const num = Number(manualValue)
    if (!Number.isFinite(num)) return
    setSavingManual(true)
    setManualError('')
    const { error } = await supabase.from('pension_value_snapshots')
      .upsert({ pension_account_id: manualFormFor, snapshot_date: new Date().toISOString().slice(0, 10), value: num }, { onConflict: 'pension_account_id,snapshot_date' })
    setSavingManual(false)
    if (error) { setManualError(error.message); return }
    setManualFormFor(null)
    setManualValue('')
    load()
  }

  async function handleHoldingSubmit(e) {
    e.preventDefault()
    if (!holdingForm.instrument_name.trim() || !holdingFormFor) return
    setSavingHolding(true)
    setHoldingError('')

    const existing = holdings.find((h) => h.pension_account_id === holdingFormFor)
    const payload = {
      instrument_name: holdingForm.instrument_name.trim(),
      instrument_type: PENSION_INSTRUMENT_TYPE,
      isin: holdingForm.isin.trim() || null,
      quantity: Number(holdingForm.quantity) || 0,
      avg_price: Number(holdingForm.current_price) || 0,
      current_price: Number(holdingForm.current_price) || 0,
    }

    const { data: saved, error } = existing
      ? await supabase.from('holdings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single()
      : await supabase.from('holdings').insert({ ...payload, pension_account_id: holdingFormFor, household_id: household.id, owner_id: user.id }).select().single()

    if (!error && saved) {
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('holding_price_snapshots')
        .upsert({ holding_id: saved.id, snapshot_date: today, price: payload.current_price }, { onConflict: 'holding_id,snapshot_date' })
      await supabase.from('pension_value_snapshots')
        .upsert({ pension_account_id: holdingFormFor, snapshot_date: today, value: payload.quantity * payload.current_price }, { onConflict: 'pension_account_id,snapshot_date' })
    }

    setSavingHolding(false)
    if (error) { setHoldingError(error.message); return }
    setHoldingFormFor(null)
    setHoldingForm(emptyHoldingForm)
    load()
  }

  async function fetchLatestPrice() {
    if (!holdingForm.isin.trim()) { setHoldingError('Fyll inn ISIN først'); return }
    setFetchingPrice(true)
    setHoldingError('')
    setFetchNote('')
    const { data, error } = await supabase.functions.invoke('fetch-storebrand-fund-price', { body: { isin: holdingForm.isin.trim() } })
    setFetchingPrice(false)
    if (error || data?.error) {
      setHoldingError(`Kunne ikke hente kurs automatisk (${data?.error || error.message}) — fyll inn manuelt.`)
      return
    }
    setHoldingForm((f) => ({ ...f, current_price: String(data.price) }))
    setFetchNote(`Hentet ${formatKr(data.price)} (kursdato ${formatDate(data.priceDate)}) fra Storebrand.`)
  }

  const chartDataByAccount = useMemo(() => {
    const byAccount = new Map()
    for (const s of snapshots) {
      const list = byAccount.get(s.pension_account_id) || []
      list.push({ date: s.snapshot_date, value: Number(s.value) })
      byAccount.set(s.pension_account_id, list)
    }
    return byAccount
  }, [snapshots])

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-title">Pensjon</div>
        <button className="btn btn-primary btn-sm" onClick={showAccountForm ? () => setShowAccountForm(false) : startAddAccount}>
          {showAccountForm ? 'Avbryt' : '+ Legg til avtale'}
        </button>
      </div>

      {showAccountForm && (
        <form onSubmit={handleAccountSubmit} className="card card-pad">
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Navn på avtale</label>
              <input className="form-input" required placeholder="F.eks. Egen pensjonskonto" value={accountForm.display_name}
                onChange={(e) => setAccountForm({ ...accountForm, display_name: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Leverandør</label>
              <input className="form-input" value={accountForm.provider}
                onChange={(e) => setAccountForm({ ...accountForm, provider: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Avtalenummer</label>
              <input className="form-input" value={accountForm.agreement_number}
                onChange={(e) => setAccountForm({ ...accountForm, agreement_number: e.target.value })} />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 'var(--space-2)' }}>Arbeidsforhold</div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Arbeidsgiver</label>
              <input className="form-input" value={accountForm.employer}
                onChange={(e) => setAccountForm({ ...accountForm, employer: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Ansattdato</label>
              <input className="form-input" type="date" value={accountForm.employment_date}
                onChange={(e) => setAccountForm({ ...accountForm, employment_date: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Årslønn</label>
              <input className="form-input" type="number" step="any" value={accountForm.annual_salary}
                onChange={(e) => setAccountForm({ ...accountForm, annual_salary: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Stillingsprosent</label>
              <input className="form-input" type="number" step="any" value={accountForm.position_percentage}
                onChange={(e) => setAccountForm({ ...accountForm, position_percentage: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Sparing av årslønn (%)</label>
              <input className="form-input" type="number" step="any" value={accountForm.savings_percentage}
                onChange={(e) => setAccountForm({ ...accountForm, savings_percentage: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Tilleggssparing 7,1G-12G (%)</label>
              <input className="form-input" type="number" step="any" value={accountForm.additional_savings_percentage}
                onChange={(e) => setAccountForm({ ...accountForm, additional_savings_percentage: e.target.value })} />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 'var(--space-2)' }}>Utbetaling og forsikring</div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Startdato utbetaling</label>
              <input className="form-input" type="date" value={accountForm.payout_start_date}
                onChange={(e) => setAccountForm({ ...accountForm, payout_start_date: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Sluttdato utbetaling</label>
              <input className="form-input" type="date" value={accountForm.payout_end_date}
                onChange={(e) => setAccountForm({ ...accountForm, payout_end_date: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Forsikringstaker</label>
              <input className="form-input" value={accountForm.policyholder}
                onChange={(e) => setAccountForm({ ...accountForm, policyholder: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Forsikret</label>
              <input className="form-input" value={accountForm.insured}
                onChange={(e) => setAccountForm({ ...accountForm, insured: e.target.value })} />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 'var(--space-2)' }}>Kostnader og opptjening</div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Administrasjonsgebyr</label>
              <input className="form-input" placeholder="F.eks. Betales av din arbeidsgiver" value={accountForm.admin_fee_note}
                onChange={(e) => setAccountForm({ ...accountForm, admin_fee_note: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Forvaltningshonorar</label>
              <input className="form-input" placeholder="F.eks. 0,6% av saldo" value={accountForm.management_fee_note}
                onChange={(e) => setAccountForm({ ...accountForm, management_fee_note: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Opptjent, nåværende arbeidsgiver</label>
              <input className="form-input" type="number" step="any" value={accountForm.accrued_current_employer}
                onChange={(e) => setAccountForm({ ...accountForm, accrued_current_employer: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Opptjent, tidligere arbeidsgivere</label>
              <input className="form-input" type="number" step="any" value={accountForm.accrued_former_employer}
                onChange={(e) => setAccountForm({ ...accountForm, accrued_former_employer: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Synlighet i husstanden</label>
            <select className="form-select" value={accountForm.visibility} onChange={(e) => setAccountForm({ ...accountForm, visibility: e.target.value })}>
              <option value="personal">Personlig (kun i formuesummer)</option>
              <option value="shared">Felles (full detalj synlig for husstanden)</option>
            </select>
          </div>

          {accountError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{accountError}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={savingAccount}>{savingAccount ? 'Lagrer…' : 'Lagre'}</button>
        </form>
      )}

      {loading ? (
        <div className="card card-pad empty-state">Laster…</div>
      ) : accounts.length === 0 && !showAccountForm ? (
        <div className="card card-pad empty-state">
          <div className="empty-state-icon">🏦</div>
          <div>Ingen pensjonsavtaler registrert ennå.</div>
        </div>
      ) : (
        accounts.map((a) => {
          const holding = holdings.find((h) => h.pension_account_id === a.id)
          const chartData = chartDataByAccount.get(a.id) || []
          const value = holding ? Number(holding.quantity) * Number(holding.current_price) : (chartData[chartData.length - 1]?.value || 0)
          const firstValue = chartData[0]?.value
          const gain = firstValue != null ? value - firstValue : null
          const gainPct = firstValue ? (gain / firstValue) * 100 : null

          return (
            <div key={a.id} className="card">
              <div className="card-pad">
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{a.display_name}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{a.provider}{a.agreement_number ? ` · ${a.agreement_number}` : ''}</div>
                  </div>
                  <div className="row">
                    <button className="btn btn-ghost btn-sm" onClick={() => startEditAccount(a)}>Rediger</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeAccount(a.id)}>Slett</button>
                  </div>
                </div>

                <div style={{ marginTop: 'var(--space-4)' }}>
                  <div className="stat-label">Verdi i dag</div>
                  <div style={{ fontSize: 32, fontWeight: 700 }}>{formatKr(value)}</div>
                  {gain != null && (
                    <div className={gain >= 0 ? 'amount-positive' : 'amount-negative'} style={{ fontSize: 13, marginTop: 2 }}>
                      {gain >= 0 ? '+' : '−'}{formatKr(Math.abs(gain))} ({gain >= 0 ? '+' : '−'}{Math.abs(gainPct).toFixed(1)}%) siden {formatDate(chartData[0].date)}
                    </div>
                  )}
                </div>
              </div>

              {chartData.length >= 2 ? (
                <div className="card-pad" style={{ height: 220, borderTop: '1px solid var(--border)' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} tickFormatter={formatDate} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v) => formatKr(v)}
                        labelFormatter={formatDate}
                        contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                        labelStyle={{ color: 'var(--text)' }}
                        itemStyle={{ color: 'var(--text)' }}
                      />
                      <Line type="monotone" dataKey="value" name="Beholdning" stroke="#3987e5" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="card-pad text-muted" style={{ fontSize: 12, borderTop: '1px solid var(--border)' }}>
                  Historikk bygges opp etter hvert som du oppdaterer kursen — kom tilbake senere for å se utvikling over tid.
                </div>
              )}

              <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="section-title">Verdi</div>
                {manualFormFor === a.id ? (
                  <form onSubmit={handleManualSubmit}>
                    <div className="form-group">
                      <label className="form-label">Saldo</label>
                      <input className="form-input" type="number" step="any" required autoFocus value={manualValue}
                        onChange={(e) => setManualValue(e.target.value)} />
                    </div>
                    {manualError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{manualError}</div>}
                    <div className="row">
                      <button className="btn btn-primary btn-sm" type="submit" disabled={savingManual}>{savingManual ? 'Lagrer…' : 'Lagre'}</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManualFormFor(null)}>Avbryt</button>
                    </div>
                  </form>
                ) : holdingFormFor === a.id ? (
                  <form onSubmit={handleHoldingSubmit}>
                    <div className="form-group">
                      <label className="form-label">Fondsnavn</label>
                      <input className="form-input" required placeholder="F.eks. Storebrand Offensiv" value={holdingForm.instrument_name}
                        onChange={(e) => setHoldingForm({ ...holdingForm, instrument_name: e.target.value })} />
                    </div>
                    <div className="row">
                      <div className="form-group grow">
                        <label className="form-label">ISIN</label>
                        <input className="form-input" placeholder="F.eks. XL8000000918" value={holdingForm.isin}
                          onChange={(e) => setHoldingForm({ ...holdingForm, isin: e.target.value })} />
                      </div>
                      <div className="form-group grow">
                        <label className="form-label">Andeler</label>
                        <input className="form-input" type="number" step="any" value={holdingForm.quantity}
                          onChange={(e) => setHoldingForm({ ...holdingForm, quantity: e.target.value })} />
                      </div>
                      <div className="form-group grow">
                        <label className="form-label">Kurs</label>
                        <input className="form-input" type="number" step="any" value={holdingForm.current_price}
                          onChange={(e) => setHoldingForm({ ...holdingForm, current_price: e.target.value })} />
                      </div>
                    </div>
                    <div className="row" style={{ marginBottom: 'var(--space-3)', alignItems: 'center' }}>
                      <button type="button" className="btn btn-sm" disabled={fetchingPrice} onClick={fetchLatestPrice}>
                        {fetchingPrice ? 'Henter…' : '↻ Hent siste kurs'}
                      </button>
                      <span className="text-muted" style={{ fontSize: 11 }}>Best-effort fra Storebrands åpne fonddata — kan slutte å virke, sjekk alltid tallet.</span>
                    </div>
                    {fetchNote && <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 'var(--space-3)' }}>{fetchNote}</div>}
                    {holdingError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{holdingError}</div>}
                    <div className="row">
                      <button className="btn btn-primary btn-sm" type="submit" disabled={savingHolding}>{savingHolding ? 'Lagrer…' : 'Lagre'}</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHoldingFormFor(null)}>Avbryt</button>
                    </div>
                  </form>
                ) : holding ? (
                  <div className="row-between">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{holding.instrument_name}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {holding.isin ? `${holding.isin} · ` : ''}{holding.quantity} andeler × {formatKr(holding.current_price)}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEditHolding(holding)}>Oppdater kurs</button>
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 'var(--space-2)' }}>
                    {chartData.length > 0 && (
                      <div className="text-muted" style={{ fontSize: 12 }}>Manuelt registrert saldo — sist oppdatert {formatDate(chartData[chartData.length - 1].date)}</div>
                    )}
                    <div className="row flex-wrap">
                      <button className="btn btn-sm" onClick={() => startManualUpdate(a.id, value)}>
                        {chartData.length > 0 ? 'Oppdater saldo' : 'Oppdater saldo manuelt'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => startAddHolding(a.id)}>+ Legg til fond i stedet</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="section-title">Om avtalen</div>
                <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', fontSize: 13, rowGap: 'var(--space-3)' }}>
                  {a.employer && <InfoRow label="Arbeidsgiver" value={a.employer} />}
                  {a.employment_date && <InfoRow label="Ansattdato" value={formatDate(a.employment_date)} />}
                  {a.annual_salary != null && <InfoRow label="Årslønn" value={formatKr(a.annual_salary)} />}
                  {a.position_percentage != null && <InfoRow label="Stillingsprosent" value={`${a.position_percentage}%`} />}
                  {a.savings_percentage != null && <InfoRow label="Sparing av årslønn" value={`${a.savings_percentage}%`} />}
                  {a.additional_savings_percentage != null && <InfoRow label="Tilleggssparing" value={`${a.additional_savings_percentage}%`} />}
                  {a.payout_start_date && <InfoRow label="Startdato utbetaling" value={formatDate(a.payout_start_date)} />}
                  {a.payout_end_date && <InfoRow label="Sluttdato utbetaling" value={formatDate(a.payout_end_date)} />}
                  {a.policyholder && <InfoRow label="Forsikringstaker" value={a.policyholder} />}
                  {a.insured && <InfoRow label="Forsikret" value={a.insured} />}
                  {a.admin_fee_note && <InfoRow label="Administrasjonsgebyr" value={a.admin_fee_note} />}
                  {a.accrued_current_employer != null && <InfoRow label="Opptjent (nåværende arbeidsgiver)" value={formatKr(a.accrued_current_employer)} />}
                  {a.accrued_former_employer != null && <InfoRow label="Opptjent (tidligere arbeidsgivere)" value={formatKr(a.accrued_former_employer)} />}
                  {a.management_fee_note && <InfoRow label="Forvaltningshonorar" value={a.management_fee_note} />}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
