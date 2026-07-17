// Natt-jobb: oppdaterer kurs på ALLE fond/pensjonsfond (på tvers av husstander)
// som har registrert ISIN. Trigges av pg_cron via net.http_post, se migrasjonen
// 'schedule_fund_price_refresh'. Bruker service-rollen bevisst for å kunne
// skrive på tvers av husstander — RLS omgås her med hensikt, autentisering skjer
// i stedet via en delt hemmelighet lagret i Supabase Vault (ikke en bruker-JWT,
// og aldri hardkodet i kildekoden siden repoet er offentlig).
//
// Best-effort mot Storebrands åpne, men udokumenterte fund-data-API (samme som
// fetch-storebrand-fund-price) — enkeltfond som feiler stopper ikke resten.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchFundPrice(isin: string): Promise<{ price: number; priceDate: string }> {
  const docUrl = `https://api.fund.storebrand.no/open/funddata/document?documentType=FUND_PROFILE&isin=${encodeURIComponent(isin)}&languageCode=no&market=NOR`
  const pdfResponse = await fetch(docUrl)
  if (!pdfResponse.ok) throw new Error(`Storebrand svarte med status ${pdfResponse.status}`)
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer())

  const { default: pdfParse } = await import('npm:pdf-parse@1.1.1')
  const parsed = await pdfParse(pdfBytes)
  const text = parsed.text.replace(/\s+/g, ' ')

  const match = text.match(/NAV\s*\/?\s*Kurs\s*\(?(\d{2}\.\d{2}\.\d{4})\)?\s*NOK\s*([\d\s.,]+)/i)
  if (!match) throw new Error('Fant ikke kurs i dokumentet')

  const priceDate = match[1].split('.').reverse().join('-')
  const price = parseFloat(match[2].trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(price) || price <= 0) throw new Error('Kunne ikke tolke kursverdien')
  return { price, priceDate }
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
      .select('id, isin, instrument_name, quantity, pension_account_id, household_id')
      .in('instrument_type', ['fond', 'pensjonsfond'])
      .not('isin', 'is', null)

    if (fetchErr) throw fetchErr

    const today = new Date().toISOString().slice(0, 10)
    let updated = 0
    const failed: { isin: string; name: string; error: string; household_id: string }[] = []

    for (const h of holdings ?? []) {
      try {
        const { price } = await fetchFundPrice(h.isin as string)
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
          isin: h.isin as string,
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
