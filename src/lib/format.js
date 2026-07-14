export function formatKr(amount) {
  return Number(amount).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
}

// Norsk datoformat dd.mm.åååå — bygget manuelt for et forutsigbart resultat
// på tvers av nettlesere, i stedet for å stole på locale-standardformatet.
// Rene datofelt (YYYY-MM-DD, uten klokkeslett) parses direkte fra strengen
// for å unngå at tidssone-konvertering flytter datoen en dag frem/tilbake.
export function formatDate(isoDate) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return `${day}.${month}.${year}`
  }
  const d = new Date(isoDate)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${d.getFullYear()}`
}
