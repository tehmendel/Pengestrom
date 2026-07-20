import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatKr, formatDate } from '../lib/format'

const emptyLoanForm = {
  accountMode: 'new',
  institution: '', display_name: '', visibility: 'personal', balance: '',
  lender: '', original_principal: '', interest_rate: '', monthly_payment: '', start_date: '', payment_account_number: '',
}

function normalizeDigits(s) {
  return (s || '').replace(/\D/g, '')
}

// Standard annuitetslån-formel: saldo etter n måneder gitt fast rente og fast
// terminbeløp. r=0 (rentefritt) håndteres som ren lineær nedbetaling.
function amortizedBalance(principal, annualRatePct, monthlyPayment, monthsElapsed) {
  if (monthsElapsed <= 0) return principal
  const r = (annualRatePct || 0) / 100 / 12
  if (r === 0) return Math.max(0, principal - monthlyPayment * monthsElapsed)
  const factor = Math.pow(1 + r, monthsElapsed)
  return Math.max(0, principal * factor - monthlyPayment * (factor - 1) / r)
}

// Løser samme formel for n (antall gjenværende terminer) gitt DAGENS saldo —
// brukes til "forventet nedbetalt"-estimatet, uavhengig av opprinnelig plan.
function monthsRemaining(balance, annualRatePct, monthlyPayment) {
  if (!monthlyPayment || monthlyPayment <= 0 || !balance || balance <= 0) return null
  const r = (annualRatePct || 0) / 100 / 12
  if (r === 0) return Math.ceil(balance / monthlyPayment)
  const inner = 1 - (r * balance) / monthlyPayment
  if (inner <= 0) return null // terminbeløpet dekker ikke renten — nedbetales aldri
  return Math.ceil(-Math.log(inner) / Math.log(1 + r))
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default function Loans() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loans, setLoans] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyLoanForm)
  const [editingLoanId, setEditingLoanId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [balanceEditingId, setBalanceEditingId] = useState(null)
  const [balanceValue, setBalanceValue] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: accs }, { data: lns }, { data: tx }] = await Promise.all([
      supabase.from('accounts').select('*').eq('account_type', 'loan').order('created_at', { ascending: true }),
      supabase.from('loans').select('*'),
      // Kun utgifter — lånebetalinger er alltid utgående. 20000 følger samme
      // begrunnelse som RecurringExpenses.jsx (unngå stille datatap på eldre husstander).
      supabase.from('transactions').select('id, date, description, notes, amount, account_id').eq('type', 'utgift').order('date', { ascending: false }).limit(20000),
    ])
    setAccounts(accs || [])
    setLoans(lns || [])
    setTransactions(tx || [])

    const loanIds = (lns || []).map((l) => l.id)
    if (loanIds.length > 0) {
      // Best-effort: friskt snapshot av dagens saldo hver gang siden besøkes,
      // slik at historikken bygges opp selv om saldoen sjelden endres manuelt.
      await Promise.all(loanIds.map((id) => supabase.rpc('record_loan_balance_snapshot', { p_loan_id: id })))
      const { data: snaps } = await supabase
        .from('loan_balance_snapshots')
        .select('loan_id, snapshot_date, balance')
        .in('loan_id', loanIds)
        .order('snapshot_date', { ascending: true })
      setSnapshots(snaps || [])
    } else {
      setSnapshots([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [household?.id])

  function startAddLoan(accountId) {
    if (accountId) {
      const acc = accounts.find((a) => a.id === accountId)
      setForm({ ...emptyLoanForm, accountMode: accountId, display_name: acc?.display_name || '' })
    } else {
      setForm(emptyLoanForm)
    }
    setEditingLoanId(null)
    setError('')
    setShowForm(true)
  }

  function startEditLoan(loan) {
    setForm({
      accountMode: loan.account_id,
      institution: '', display_name: '', visibility: 'personal', balance: '',
      lender: loan.lender || '',
      original_principal: loan.original_principal != null ? String(loan.original_principal) : '',
      interest_rate: loan.interest_rate != null ? String(loan.interest_rate) : '',
      monthly_payment: loan.monthly_payment != null ? String(loan.monthly_payment) : '',
      start_date: loan.start_date || '',
      payment_account_number: loan.payment_account_number || '',
    })
    setEditingLoanId(loan.id)
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    let accountId = form.accountMode !== 'new' ? form.accountMode : null

    if (!accountId) {
      if (!form.institution.trim() || !form.display_name.trim()) {
        setError('Fyll inn bank og visningsnavn')
        setSaving(false)
        return
      }
      const { data: acc, error: accErr } = await supabase.from('accounts').insert({
        household_id: household.id,
        owner_id: user.id,
        institution: form.institution.trim(),
        account_type: 'loan',
        display_name: form.display_name.trim(),
        visibility: form.visibility,
        connection_type: 'manual',
        balance: form.balance === '' ? null : Number(form.balance),
      }).select().single()
      if (accErr) { setError(accErr.message); setSaving(false); return }
      accountId = acc.id
    }

    const payload = {
      account_id: accountId,
      lender: form.lender.trim() || null,
      original_principal: form.original_principal === '' ? null : Number(form.original_principal),
      interest_rate: form.interest_rate === '' ? null : Number(form.interest_rate),
      monthly_payment: form.monthly_payment === '' ? null : Number(form.monthly_payment),
      start_date: form.start_date || null,
      payment_account_number: form.payment_account_number.trim() || null,
    }

    const { data: savedLoan, error } = editingLoanId
      ? await supabase.from('loans').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingLoanId).select().single()
      : await supabase.from('loans').insert({ ...payload, household_id: household.id, owner_id: user.id }).select().single()

    setSaving(false)
    if (error) { setError(error.message); return }
    if (savedLoan) await supabase.rpc('record_loan_balance_snapshot', { p_loan_id: savedLoan.id })
    setShowForm(false)
    setForm(emptyLoanForm)
    setEditingLoanId(null)
    load()
  }

  async function removeLoanDetails(loan) {
    if (!window.confirm('Fjerne lånedetaljene (rente, betalingsplan, historikk)? Selve kontoen og saldoen beholdes — kan gjøres om under Kontoer.')) return
    await supabase.from('loans').delete().eq('id', loan.id)
    load()
  }

  async function saveBalance(loan) {
    const num = Number(balanceValue)
    if (!Number.isFinite(num)) return
    await supabase.from('accounts').update({ balance: num }).eq('id', loan.account_id)
    await supabase.rpc('record_loan_balance_snapshot', { p_loan_id: loan.id })
    setBalanceEditingId(null)
    load()
  }

  const linkedAccountIds = new Set(loans.map((l) => l.account_id))
  const unlinkedAccounts = accounts.filter((a) => !linkedAccountIds.has(a.id))

  const snapshotsByLoan = useMemo(() => {
    const byLoan = new Map()
    for (const s of snapshots) {
      const list = byLoan.get(s.loan_id) || []
      list.push(s)
      byLoan.set(s.loan_id, list)
    }
    return byLoan
  }, [snapshots])

  const totalDebt = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
  const totalMonthly = loans.reduce((sum, l) => sum + (Number(l.monthly_payment) || 0), 0)

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-title">Lån</div>
        <button className="btn btn-primary btn-sm" onClick={showForm ? () => setShowForm(false) : () => startAddLoan(null)}>
          {showForm ? 'Avbryt' : '+ Nytt lån'}
        </button>
      </div>

      {!loading && accounts.length > 0 && (
        <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="icon-chip icon-chip-red">🏦</span>
              <span className="stat-label">Total gjeld</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{formatKr(totalDebt)}</div>
          </div>
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="icon-chip icon-chip-yellow">📅</span>
              <span className="stat-label">Sum månedlig betaling</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{formatKr(totalMonthly)}</div>
          </div>
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="icon-chip icon-chip-blue">📄</span>
              <span className="stat-label">Antall lån</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{accounts.length}</div>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card card-pad">
          {!editingLoanId && (
            <div className="form-group">
              <label className="form-label">Konto</label>
              <select className="form-select" value={form.accountMode} onChange={(e) => setForm({ ...form, accountMode: e.target.value })}>
                <option value="new">+ Ny lånekonto</option>
                {unlinkedAccounts.map((a) => <option key={a.id} value={a.id}>{a.display_name} ({a.institution})</option>)}
              </select>
            </div>
          )}

          {form.accountMode === 'new' && !editingLoanId && (
            <>
              <div className="row">
                <div className="form-group grow">
                  <label className="form-label">Bank/långiver</label>
                  <input className="form-input" required placeholder="F.eks. DNB" value={form.institution}
                    onChange={(e) => setForm({ ...form, institution: e.target.value })} />
                </div>
                <div className="form-group grow">
                  <label className="form-label">Visningsnavn</label>
                  <input className="form-input" required placeholder="F.eks. Boliglån" value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                </div>
              </div>
              <div className="row">
                <div className="form-group grow">
                  <label className="form-label">Nåværende saldo (kr)</label>
                  <input className="form-input" type="number" step="any" value={form.balance}
                    onChange={(e) => setForm({ ...form, balance: e.target.value })} />
                </div>
                <div className="form-group grow">
                  <label className="form-label">Synlighet i husstanden</label>
                  <select className="form-select" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                    <option value="personal">Personlig</option>
                    <option value="shared">Felles</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="section-title" style={{ marginTop: 'var(--space-2)' }}>Betalingsplan</div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Långiver</label>
              <input className="form-input" placeholder="F.eks. DNB" value={form.lender}
                onChange={(e) => setForm({ ...form, lender: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Opprinnelig lånebeløp (kr)</label>
              <input className="form-input" type="number" step="any" value={form.original_principal}
                onChange={(e) => setForm({ ...form, original_principal: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="form-group grow">
              <label className="form-label">Rente (% p.a.)</label>
              <input className="form-input" type="number" step="any" value={form.interest_rate}
                onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Månedlig terminbeløp (kr)</label>
              <input className="form-input" type="number" step="any" value={form.monthly_payment}
                onChange={(e) => setForm({ ...form, monthly_payment: e.target.value })} />
            </div>
            <div className="form-group grow">
              <label className="form-label">Startdato</label>
              <input className="form-input" type="date" value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kontonummer betalingene går til</label>
            <input className="form-input" placeholder="F.eks. 1234.56.78901" value={form.payment_account_number}
              onChange={(e) => setForm({ ...form, payment_account_number: e.target.value })} />
            <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
              Brukes til å finne igjen betalingene dine automatisk blant importerte transaksjoner.
            </div>
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Lagrer…' : 'Lagre'}</button>
        </form>
      )}

      {loading ? (
        <div className="card card-pad empty-state">Laster…</div>
      ) : accounts.length === 0 && !showForm ? (
        <div className="card card-pad empty-state">
          <div className="empty-state-icon">🏦</div>
          <div>Ingen lån registrert ennå.</div>
        </div>
      ) : (
        accounts.map((account) => {
          const loan = loans.find((l) => l.account_id === account.id)
          if (!loan) {
            return (
              <div key={account.id} className="card card-pad row-between">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{account.display_name}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {account.institution} · {formatKr(account.balance || 0)}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => startAddLoan(account.id)}>+ Legg til lånedetaljer</button>
              </div>
            )
          }

          return <LoanCard key={loan.id} loan={loan} account={account}
            snapshots={snapshotsByLoan.get(loan.id) || []}
            transactions={transactions}
            onEdit={() => startEditLoan(loan)}
            onRemove={() => removeLoanDetails(loan)}
            balanceEditing={balanceEditingId === loan.id}
            balanceValue={balanceValue}
            onStartBalanceEdit={() => { setBalanceEditingId(loan.id); setBalanceValue(String(account.balance ?? '')) }}
            onBalanceValueChange={setBalanceValue}
            onSaveBalance={() => saveBalance(loan)}
          />
        })
      )}
    </div>
  )
}

function LoanCard({ loan, account, snapshots, transactions, onEdit, onRemove, balanceEditing, balanceValue, onStartBalanceEdit, onBalanceValueChange, onSaveBalance }) {
  const balance = Number(account.balance) || 0

  const matched = useMemo(() => {
    const normalized = normalizeDigits(loan.payment_account_number)
    if (!normalized) return []
    return transactions.filter((t) => {
      const desc = normalizeDigits(t.description)
      const notes = normalizeDigits(t.notes)
      return (desc && desc.includes(normalized)) || (notes && notes.includes(normalized))
    })
  }, [transactions, loan.payment_account_number])

  const paidThisYear = matched
    .filter((t) => t.date.slice(0, 4) === String(new Date().getFullYear()))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const monthlyTotals = useMemo(() => {
    const now = new Date()
    const byMonth = new Map()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      byMonth.set(`${d.getFullYear()}-${d.getMonth()}`, { month: d.toLocaleDateString('nb-NO', { month: 'short' }).replace('.', ''), total: 0 })
    }
    for (const t of matched) {
      const d = new Date(t.date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const bucket = byMonth.get(key)
      if (bucket) bucket.total += Number(t.amount)
    }
    return Array.from(byMonth.values())
  }, [matched])

  const remainingMonths = monthsRemaining(balance, loan.interest_rate, loan.monthly_payment)
  const payoffDate = remainingMonths != null ? addMonths(new Date(), remainingMonths) : null

  const chartData = useMemo(() => {
    const byDate = new Map()
    if (loan.original_principal && loan.start_date && loan.monthly_payment) {
      const start = new Date(loan.start_date)
      const now = new Date()
      const monthsSinceStart = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()))
      const step = monthsSinceStart > 60 ? Math.ceil(monthsSinceStart / 60) : 1
      for (let m = 0; m <= monthsSinceStart; m += step) {
        const d = new Date(start.getFullYear(), start.getMonth() + m, 1)
        const planned = amortizedBalance(Number(loan.original_principal), Number(loan.interest_rate), Number(loan.monthly_payment), m)
        const key = d.toISOString().slice(0, 10)
        byDate.set(key, { ...(byDate.get(key) || {}), date: key, planned })
        if (planned <= 0) break
      }
    }
    for (const s of snapshots) {
      byDate.set(s.snapshot_date, { ...(byDate.get(s.snapshot_date) || {}), date: s.snapshot_date, actual: Number(s.balance) })
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [snapshots, loan])

  return (
    <div className="card">
      <div className="card-pad">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{account.display_name}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>{loan.lender || account.institution}</div>
          </div>
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>Rediger</button>
            <button className="btn btn-ghost btn-sm" onClick={onRemove}>Fjern detaljer</button>
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <div className="stat-label">Gjenværende gjeld</div>
          {balanceEditing ? (
            <div className="row" style={{ marginTop: 4 }}>
              <input className="form-input" style={{ width: 160 }} type="number" step="any" value={balanceValue}
                onChange={(e) => onBalanceValueChange(e.target.value)} autoFocus />
              <button className="btn btn-primary btn-sm" onClick={onSaveBalance}>Lagre</button>
            </div>
          ) : (
            <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{formatKr(balance)}</div>
              <button className="btn btn-ghost btn-sm" onClick={onStartBalanceEdit}>Oppdater</button>
            </div>
          )}
        </div>

        <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: 'var(--space-3)' }}>
          {loan.interest_rate != null && (
            <div>
              <div className="text-muted" style={{ fontSize: 11 }}>Rente</div>
              <div style={{ fontWeight: 600 }}>{loan.interest_rate}% p.a.</div>
            </div>
          )}
          {loan.monthly_payment != null && (
            <div>
              <div className="text-muted" style={{ fontSize: 11 }}>Månedlig betaling</div>
              <div style={{ fontWeight: 600 }}>{formatKr(loan.monthly_payment)}</div>
            </div>
          )}
          {payoffDate && (
            <div>
              <div className="text-muted" style={{ fontSize: 11 }}>Estimert nedbetalt</div>
              <div style={{ fontWeight: 600 }}>{formatDate(payoffDate)}</div>
            </div>
          )}
          {loan.original_principal != null && (
            <div>
              <div className="text-muted" style={{ fontSize: 11 }}>Opprinnelig lån</div>
              <div style={{ fontWeight: 600 }}>{formatKr(loan.original_principal)}</div>
            </div>
          )}
        </div>
      </div>

      {chartData.length >= 2 ? (
        <div className="card-pad" style={{ height: 240, borderTop: '1px solid var(--border)' }}>
          <div className="section-title">Saldoutvikling</div>
          <ResponsiveContainer width="100%" height="88%">
            <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4 }}>
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
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="planned" name="Planlagt (betalingsplan)" stroke="var(--muted)" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="actual" name="Faktisk saldo" stroke="#3987e5" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card-pad text-muted" style={{ fontSize: 12, borderTop: '1px solid var(--border)' }}>
          Saldohistorikk bygges opp etter hvert som du besøker siden — fyll inn opprinnelig lånebeløp, rente og terminbeløp for å også se en planlagt nedbetalingskurve.
        </div>
      )}

      <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Betalinger, siste 12 måneder</div>
          <span className="text-mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{formatKr(paidThisYear)} i {new Date().getFullYear()}</span>
        </div>
        {!loan.payment_account_number ? (
          <div className="text-muted" style={{ fontSize: 12 }}>Legg til kontonummeret betalingene går til for å se dem automatisk her.</div>
        ) : matched.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 12 }}>Fant ingen importerte transaksjoner mot dette kontonummeret ennå.</div>
        ) : (
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTotals} margin={{ left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v) => formatKr(v)}
                  cursor={{ fill: 'var(--surface-2)' }}
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ color: 'var(--text)' }}
                  itemStyle={{ color: 'var(--text)' }}
                />
                <Bar dataKey="total" name="Betalt" fill="#e66767" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
