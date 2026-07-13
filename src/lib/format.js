export function formatKr(amount) {
  return Number(amount).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
}

export function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })
}
