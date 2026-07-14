import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatDate, formatKr } from '../lib/format'
import CategoryPicker from './CategoryPicker'

// Shown when deleting a category that still has transactions attached.
// Every affected transaction must get a new category (bulk or one-by-one)
// before the delete goes through — none are left uncategorized.
export default function RecategorizeModal({ category, transactions, categories, onDone, onCancel }) {
  const [assignments, setAssignments] = useState({})
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const targets = categories.filter((c) => c.id !== category.id && c.type === category.type)
  const remaining = transactions.filter((t) => !assignments[t.id]).length

  function applyBulk() {
    if (!bulkCategoryId) return
    const next = { ...assignments }
    for (const t of transactions) next[t.id] = bulkCategoryId
    setAssignments(next)
  }

  function setOne(txId, categoryId) {
    setAssignments((prev) => ({ ...prev, [txId]: categoryId }))
  }

  async function commit() {
    if (remaining > 0) {
      setError(`${remaining} transaksjoner mangler fortsatt ny kategori`)
      return
    }
    setBusy(true)
    setError('')

    const byTarget = new Map()
    for (const t of transactions) {
      const target = assignments[t.id]
      if (!byTarget.has(target)) byTarget.set(target, [])
      byTarget.get(target).push(t.id)
    }

    for (const [targetId, ids] of byTarget) {
      const { error } = await supabase.from('transactions').update({ category_id: targetId }).in('id', ids)
      if (error) { setError(error.message); setBusy(false); return }
    }

    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    setBusy(false)
    if (error) { setError(error.message); return }
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <div className="modal-title">Rekategoriser før sletting</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          {transactions.length} transaksjoner bruker «{category.name}». Velg ny kategori for alle før den kan fjernes —
          ingen transaksjoner skal stå uten kategori.
        </div>

        <div className="card card-pad" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="form-label">Sett samme kategori for alle</div>
          <div className="row">
            <div className="grow">
              <CategoryPicker categories={targets} value={bulkCategoryId} onChange={setBulkCategoryId} placeholder="Velg kategori…" />
            </div>
            <button className="btn btn-sm" onClick={applyBulk} disabled={!bulkCategoryId}>Bruk på alle</button>
          </div>
        </div>

        <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
          {transactions.map((t) => (
            <div key={t.id} className="row-between" style={{ gap: 'var(--space-3)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{formatDate(t.date)} · {t.type === 'utgift' ? '−' : '+'}{formatKr(t.amount)}</div>
              </div>
              <div style={{ width: 200, flexShrink: 0 }}>
                <CategoryPicker categories={targets} value={assignments[t.id] || ''} onChange={(id) => setOne(t.id, id)} placeholder="Velg…" />
              </div>
            </div>
          ))}
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Avbryt</button>
          <button className="btn btn-primary" onClick={commit} disabled={busy || remaining > 0}>
            {busy ? 'Lagrer…' : remaining > 0 ? `${remaining} gjenstår` : 'Godkjenn og fjern kategori'}
          </button>
        </div>
      </div>
    </div>
  )
}
