// Natt-jobb: oppdaterer kurs på ALLE fond/pensjonsfond (på tvers av husstander)
// som har registrert ISIN eller kilde-URL. Trigges av pg_cron via net.http_post,
// se migrasjonen 'schedule_fund_price_refresh'. Bruker service-rollen bevisst
// for å kunne skrive på tvers av husstander — RLS omgås her med hensikt,
// autentisering skjer i stedet via en delt hemmelighet lagret i Supabase Vault
// (ikke en bruker-JWT, og aldri hardkodet i kildekoden siden repoet er offentlig).
//
// Samme to-trinns oppslag som fetch-fund-price: Storebrands åpne fund-data-API
// via ISIN først, deretter kilde-URL-skraping (f.eks. Nordnets fondsider) som
// fallback. Begge veier er best-effort — enkeltfond som feiler stopper ikke resten.

import { createClient } from 'npm:@supabase/supabase-js@2'

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

async function fetchFundPrice(isin: string | null, sourceUrl: string | null): Promise<{ price: number; priceDate: string }> {
  const errors: string[] = []

  if (isin) {
    try {
      return await fetchStorebrandPrice(isin)
    } catch (err) {
      errors.push(`Storebrand: ${err instanceof Error ? err.message : 'ukjent feil'}`)
    }
  }

  if (sourceUrl) {
    try {
      return await fetchScrapedPrice(sourceUrl)
    } catch (err) {
      errors.push(`Kilde-URL: ${err instanceof Error ? err.message : 'ukjent feil'}`)
    }
  }

  if (errors.length === 0) throw new Error('Ingen ISIN eller kilde-URL registrert')
  throw new Error(errors.join(' | '))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // vault-skjemaet er ikke eksponert via PostgREST — hemmeligheten hentes i
    // stedet via en wrapper-funksjon i public-skjemaet, strengt låst til
    // service_role (se migrasjonen 'fund_price_cron_secret_accessor').
    const { data: secret, error: secretErr } = await supabase.rpc('get_fund_price_cron_secret')
    if (secretErr || !secret) throw new Error('Fant ikke delt hemmelighet i Vault')

    const authHeader = req.headers.get('Authorization') || ''
    if (authHeader !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: holdings, error: fetchErr } = await supabase
      .from('holdings')
      .select('id, isin, source_url, instrument_name, quantity, pension_account_id, household_id')
      .in('instrument_type', ['fond', 'pensjonsfond'])
      .or('isin.not.is.null,source_url.not.is.null')

    if (fetchErr) throw fetchErr

    const today = new Date().toISOString().slice(0, 10)
    let updated = 0
    const failed: { isin: string; name: string; error: string; household_id: string }[] = []

    for (const h of holdings ?? []) {
      try {
        const { price } = await fetchFundPrice((h.isin as string) || null, (h.source_url as string) || null)
        await supabase.from('holdings').update({ current_price: price, updated_at: new Date().toISOString() }).eq('id', h.id)
        await supabase.from('holding_price_snapshots')
          .upsert({ holding_id: h.id, snapshot_date: today, price }, { onConflict: 'holding_id,snapshot_date' })
        if (h.pension_account_id) {
          await supabase.from('pension_value_snapshots')
            .upsert({ pension_account_id: h.pension_account_id, snapshot_date: today, value: Number(h.quantity) * price }, { onConflict: 'pension_account_id,snapshot_date' })
        }
        updated++
      } catch (err) {
        failed.push({
          isin: (h.isin as string) || '',
          name: h.instrument_name as string,
          error: err instanceof Error ? err.message : 'Ukjent feil',
          household_id: h.household_id as string,
        })
      }
    }

    // Ett varsel per husstand som fikk minst én feilet oppdatering — synlig via
    // bjellen neste gang noen i husstanden logger på, ikke bare i denne responsen.
    const byHousehold = new Map<string, { name: string; isin: string; error: string }[]>()
    for (const f of failed) {
      const list = byHousehold.get(f.household_id) || []
      list.push({ name: f.name, isin: f.isin, error: f.error })
      byHousehold.set(f.household_id, list)
    }
    for (const [householdId, items] of byHousehold) {
      await supabase.from('notifications').insert({
        household_id: householdId,
        source: 'cron',
        title: `Nattlig kursoppdatering feilet for ${items.length} fond`,
        detail: { items },
      })
    }

    return new Response(
      JSON.stringify({ updated, failed, total: (holdings ?? []).length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ukjent feil'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
