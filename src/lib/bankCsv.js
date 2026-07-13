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

function stripQuotes(value) {
  return value.replace(/^"(.*)"$/, '$1').trim()
}

function normalizeHeader(value) {
  return stripQuotes(value).replace(/\s+/g, ' ').trim().toLowerCase()
}

function parseAmount(raw) {
  const value = stripQuotes(raw || '').trim()
  if (!value || value === '-') return 0
  const compact = value.replace(/\s/g, '')
  if (compact.includes(',')) {
    return parseFloat(compact.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(compact) || 0
}

function parseDate(raw) {
  const value = stripQuotes(raw || '').trim()
  if (!value) return null
  const parts = value.split('.')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return null
}

function detectSeparator(headerLine) {
  if (headerLine.includes('\t')) return '\t'
  if (headerLine.includes(';')) return ';'
  return ','
}

export function parseBankCsv(rawText) {
  const text = rawText.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return { transactions: [], error: 'Filen inneholder for få linjer' }

  const separator = detectSeparator(lines[0])
  const headers = lines[0].split(separator).map(normalizeHeader)
  const columnIndex = (name) => headers.indexOf(normalizeHeader(name))
  const cell = (cols, idx) => (idx >= 0 ? stripQuotes(cols[idx] || '') : '')

  const idxIn = headers.findIndex((h) => h.includes('bel') && h.includes('inn'))
  const idxOut = headers.findIndex((h) => h.includes('bel') && h.includes('ut'))
  const idxStatus = headers.findIndex((h) => h === 'status')
  const idxDesc = columnIndex('beskrivelse')
  const idxDate = columnIndex('bokført dato') >= 0 ? columnIndex('bokført dato') : columnIndex('utført dato')
  const idxAccount = headers.findIndex((h) => h === 'kontonummer' || (h.includes('konto') && !h.includes('inn') && !h.includes('ut')))
  const idxBalance = columnIndex('saldo')
  const idxMessage = columnIndex('melding/kid/fakt.nr')

  if (idxIn < 0 || idxOut < 0 || idxDate < 0) {
    return { transactions: [], error: `Fant ikke forventede kolonner. Kolonner i filen: ${headers.join(' | ')}` }
  }

  const transactions = []
  let accountNumber = null
  let lastBalance = null

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(separator)
    if (cols.length < 3) continue
    if (idxStatus >= 0 && cell(cols, idxStatus).toLowerCase() === 'reservert') continue

    const inflow = parseAmount(cell(cols, idxIn))
    const outflow = parseAmount(cell(cols, idxOut))
    const isIncome = inflow > 0
    const isExpense = outflow < 0
    if (!isIncome && !isExpense) continue

    const date = parseDate(cell(cols, idxDate))
    if (!date) continue

    if (idxAccount >= 0 && !accountNumber) {
      const candidate = cell(cols, idxAccount).replace(/\s/g, '')
      if (/^\d{11}$/.test(candidate)) accountNumber = candidate
    }
    if (idxBalance >= 0) {
      const balance = parseAmount(cell(cols, idxBalance))
      if (balance !== 0) lastBalance = balance
    }

    transactions.push({
      date,
      description: cell(cols, idxDesc) || cell(cols, idxMessage) || '(uten beskrivelse)',
      notes: cell(cols, idxMessage),
      amount: isIncome ? inflow : Math.abs(outflow),
      type: isIncome ? 'inntekt' : 'utgift',
    })
  }

  return { transactions, accountNumber, lastBalance, error: null }
}
