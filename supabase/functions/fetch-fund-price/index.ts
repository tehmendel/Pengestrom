// Henter siste fondskurs. Prøver først Storebrands åpne, men udokumenterte
// fund-data-API via ISIN (dekker fond distribuert gjennom Storebrand — deres
// PDF-rapport er faktisk en Morningstar-generert dokument, så dette dekker
// trolig et bredere fondsutvalg enn bare Storebrands egne). Hvis det ikke gir
// treff og en kilde-URL er oppgitt, faller den tilbake til å lese prisen
// direkte av en offentlig fondside (f.eks. Nordnets egne fondsider, som ikke
// har noe åpent API i det hele tatt). Begge veier er best-effort — undokumenterte
// kilder som kan slutte å virke uten varsel. Erstatter fetch-storebrand-fund-price.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchStorebrandPrice(isin: string): Promise<{ price: number; priceDate: string }> {
  const docUrl = `https://api.fund.storebrand.no/open/funddata/document?documentType=FUND_PROFILE&isin=${encodeURIComponent(isin)}&languageCode=no&market=NOR`
  const pdfResponse = await fetch(docUrl)
  if (!pdfResponse.ok) throw new Error(`Storebrand svarte med status ${pdfResponse.status}`)
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer())

  const { default: pdfParse } = await import('npm:pdf-parse@1.1.1')
  const parsed = await pdfParse(pdfBytes)
  const text = parsed.text.replace(/\s+/g, ' ')

  const match = text.match(/NAV\s*\/?\s*Kurs\s*\(?(\d{2}\.\d{2}\.\d{4})\)?\s*NOK\s*([\d\s.,]+)/i)
  if (!match) throw new Error('Fant ikke kurs i Storebrand-dokumentet')

  const priceDate = match[1].split('.').reverse().join('-')
  const price = parseFloat(match[2].trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(price) || price <= 0) throw new Error('Kunne ikke tolke kursverdien fra Storebrand')
  return { price, priceDate }
}

const NORWEGIAN_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, mars: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, desember: 12,
}

// "16. juli" har ingen årstall — antar inneværende år, eller i fjor hvis
// datoen da ville ligget frem i tid (dekker årsskifte-tilfellet i januar).
function parseNorwegianShortDate(text: string): string {
  const m = text.trim().match(/(\d{1,2})\.\s*([a-zæøå]+)/i)
  if (!m) throw new Error('Klarte ikke å tolke datoen fra siden')
  const day = parseInt(m[1], 10)
  const month = NORWEGIAN_MONTHS[m[2].toLowerCase()]
  if (!month) throw new Error('Ukjent månedsnavn i datoen fra siden')
  const now = new Date()
  let year = now.getFullYear()
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (candidate.getTime() > now.getTime() + 24 * 60 * 60 * 1000) year -= 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function fetchScrapedPrice(sourceUrl: string): Promise<{ price: number; priceDate: string }> {
  const pageResponse = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!pageResponse.ok) throw new Error(`Kilde-URL svarte med status ${pageResponse.status}`)
  const html = await pageResponse.text()
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  const match = text.match(/Siste NAV-kurs\s*\(([^)]+)\)\s*([\d.,]+)\s*NOK/i)
  if (!match) throw new Error('Fant ikke kurs på kilde-siden (forventer Nordnet-fondside-format)')

  const priceDate = parseNorwegianShortDate(match[1])
  const price = parseFloat(match[2].trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(price) || price <= 0) throw new Error('Kunne ikke tolke kursverdien fra kilde-siden')
  return { price, priceDate }
}

export async function fetchFundPrice(
  isin: string | null,
  sourceUrl: string | null,
): Promise<{ price: number; priceDate: string; source: string }> {
  const errors: string[] = []

  if (isin) {
    try {
      const r = await fetchStorebrandPrice(isin)
      return { ...r, source: 'storebrand' }
    } catch (err) {
      errors.push(`Storebrand: ${err instanceof Error ? err.message : 'ukjent feil'}`)
    }
  }

  if (sourceUrl) {
    try {
      const r = await fetchScrapedPrice(sourceUrl)
      return { ...r, source: 'kilde-url' }
    } catch (err) {
      errors.push(`Kilde-URL: ${err instanceof Error ? err.message : 'ukjent feil'}`)
    }
  }

  if (errors.length === 0) throw new Error('Ingen ISIN eller kilde-URL oppgitt')
  throw new Error(errors.join(' | '))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { isin, sourceUrl } = (await req.json()) as { isin?: string; sourceUrl?: string }
    if (isin && !/^[A-Z0-9]{8,14}$/i.test(isin)) throw new Error('Ugyldig ISIN')

    const result = await fetchFundPrice(isin?.trim() || null, sourceUrl?.trim() || null)
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ukjent feil'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
