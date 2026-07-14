import { extractVendorKey } from './categorize'

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7)
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

// Classifies a recurring vendor's cadence from the median gap between
// consecutive occurrences, and predicts the next date from the last one.
function cadenceFromGaps(sortedDates) {
  const gaps = []
  for (let i = 1; i < sortedDates.length; i++) gaps.push(daysBetween(sortedDates[i - 1], sortedDates[i]))
  const gap = median(gaps)

  let label = 'Uregelmessig'
  if (gap >= 6 && gap <= 8) label = 'Ukentlig'
  else if (gap >= 25 && gap <= 35) label = 'Månedlig'
  else if (gap >= 85 && gap <= 100) label = 'Kvartalsvis'
  else if (gap >= 350 && gap <= 380) label = 'Årlig'

  const last = sortedDates[sortedDates.length - 1]
  const nextDate = new Date(last)
  nextDate.setDate(nextDate.getDate() + Math.round(gap))

  return { cadenceLabel: label, cadenceDays: gap, nextDate: nextDate.toISOString().slice(0, 10) }
}

// Groups expense transactions by vendor and flags ones that look like a
// recurring/fixed cost: same vendor, showing up in at least two different
// months, with an amount that stays within ±20% of its own median.
export function detectRecurringExpenses(transactions) {
  const groups = new Map()
  for (const t of transactions) {
    const key = extractVendorKey(t.description)
    if (key.length < 3) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }

  const results = []
  for (const [key, txs] of groups) {
    const months = new Set(txs.map((t) => monthKey(t.date)))
    if (months.size < 2) continue

    const amounts = txs.map((t) => Number(t.amount))
    const med = median(amounts)
    if (med <= 0) continue

    const consistent = txs.filter((t) => Math.abs(Number(t.amount) - med) / med <= 0.2)
    if (consistent.length < 2) continue

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const { cadenceLabel, nextDate } = cadenceFromGaps(sorted.map((t) => t.date))
    const monthlyEstimate = cadenceLabel === 'Årlig' ? med / 12 : cadenceLabel === 'Kvartalsvis' ? med / 3 : med

    results.push({
      vendorKey: key,
      displayName: sorted[sorted.length - 1].description,
      accountName: sorted[sorted.length - 1].accounts?.display_name || null,
      amount: med,
      monthlyEstimate,
      occurrences: txs.length,
      monthCount: months.size,
      lastDate: sorted[sorted.length - 1].date,
      cadenceLabel,
      nextDate,
    })
  }

  return results.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
}
