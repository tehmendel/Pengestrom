// Leser CSV-eksport fra norske nettbanker (Rogaland Sparebank, Eika-alliansen m.fl.)
// Kolonneoppsettet varierer noe mellom banker, så header-oppslag er case/whitespace-uavhengig
// og faller tilbake på delvise treff for beløpskolonner.

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const utf8Reader = new FileReader()
    utf8Reader.onerror = reject
    utf8Reader.onload = (e) => {
      const text = e.target.result
      if (text.includes('�')) {
        const fallbackReader = new FileReader()
        fallbackReader.onerror = reject
        fallbackReader.onload = (e2) => resolve(e2.target.result)
        fallbackReader.readAsText(file, 'iso-8859-1')
      } else {
        resolve(text)
      }
    }
    utf8Reader.readAsText(file, 'utf-8')
  })
}

// RFC4180-aware CSV tokenizer. A naive text.split(/\r?\n/) breaks on quoted
// fields that legitimately contain a literal newline (banks do this for
// multi-line "Melding"/KID text — Excel renders it as a wrapped cell) and on
// separators that appear inside a quoted field. This walks the text
// character by character so quoting rules are actually respected, and
// unescapes "" back to a literal " along the way.
function tokenizeCsv(text, separator) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') { inQuotes = true; continue }
    if (ch === separator) { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  return rows
}

function normalizeHeader(value) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function parseAmount(raw) {
  const value = (raw || '').trim()
  if (!value || value === '-') return 0
  const compact = value.replace(/\s/g, '')
  if (compact.includes(',')) {
    return parseFloat(compact.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(compact) || 0
}

function parseDate(raw) {
  const value = (raw || '').trim()
  if (!value) return null
  const parts = value.split('.')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return null
}

// A field spanning multiple physical lines (embedded newline inside quotes)
// is flattened to one line with a space, so it renders cleanly anywhere a
// transaction's notes/description is shown as a single line of text.
function cellText(row, idx) {
  if (idx < 0) return ''
  return (row[idx] || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function detectSeparator(headerLine) {
  if (headerLine.includes('\t')) return '\t'
  if (headerLine.includes(';')) return ';'
  return ','
}

export function parseBankCsv(rawText) {
  const text = rawText.replace(/^﻿/, '')
  const firstLine = text.slice(0, text.search(/\r?\n/) >= 0 ? text.search(/\r?\n/) : text.length)
  const separator = detectSeparator(firstLine)

  const allRows = tokenizeCsv(text, separator).filter((r) => r.some((c) => c.trim().length > 0))
  if (allRows.length < 2) return { transactions: [], error: 'Filen inneholder for få linjer' }

  const headers = allRows[0].map(normalizeHeader)
  const columnIndex = (name) => headers.indexOf(normalizeHeader(name))

  const idxIn = headers.findIndex((h) => h.includes('bel') && h.includes('inn'))
  const idxOut = headers.findIndex((h) => h.includes('bel') && h.includes('ut'))
  const idxStatus = headers.findIndex((h) => h === 'status')
  const idxDesc = columnIndex('beskrivelse')
  const idxDate = columnIndex('bokført dato') >= 0 ? columnIndex('bokført dato') : columnIndex('utført dato')
  const idxAccount = headers.findIndex((h) => h === 'kontonummer' || (h.includes('konto') && !h.includes('inn') && !h.includes('ut')))
  const idxBalance = columnIndex('saldo')
  const idxMessage = columnIndex('melding/kid/fakt.nr')
  const idxType = headers.findIndex((h) => h === 'type')
  const idxSubtype = headers.findIndex((h) => h === 'undertype')

  if (idxIn < 0 || idxOut < 0 || idxDate < 0) {
    return { transactions: [], error: `Fant ikke forventede kolonner. Kolonner i filen: ${headers.join(' | ')}` }
  }

  const transactions = []
  let accountNumber = null
  let lastBalance = null

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i]
    if (row.length < 3) continue
    if (idxStatus >= 0 && cellText(row, idxStatus).toLowerCase() === 'reservert') continue

    const inflow = parseAmount(cellText(row, idxIn))
    const outflow = parseAmount(cellText(row, idxOut))
    const isIncome = inflow > 0
    const isExpense = outflow < 0
    if (!isIncome && !isExpense) continue

    const date = parseDate(cellText(row, idxDate))
    if (!date) continue

    if (idxAccount >= 0 && !accountNumber) {
      const candidate = cellText(row, idxAccount).replace(/\s/g, '')
      if (/^\d{11}$/.test(candidate)) accountNumber = candidate
    }
    if (idxBalance >= 0) {
      const balance = parseAmount(cellText(row, idxBalance))
      if (balance !== 0) lastBalance = balance
    }

    const description = cellText(row, idxDesc) || cellText(row, idxMessage) || '(uten beskrivelse)'
    const notes = cellText(row, idxMessage)
    const csvType = cellText(row, idxType)
    const csvSubtype = cellText(row, idxSubtype)

    transactions.push({
      date,
      description,
      notes,
      amount: isIncome ? inflow : Math.abs(outflow),
      type: isIncome ? 'inntekt' : 'utgift',
      raw: row.map((c) => c.replace(/\r?\n/g, ' ')).join(separator),
      csvType,
      csvSubtype,
      // Bredere matchtekst enn bare beskrivelsen — regler kan også treffe på
      // bankens egen type/undertype (f.eks. "Overføring til egen konto").
      matchText: [description, csvType, csvSubtype, notes].filter(Boolean).join(' '),
    })
  }

  return { transactions, accountNumber, lastBalance, error: null }
}
