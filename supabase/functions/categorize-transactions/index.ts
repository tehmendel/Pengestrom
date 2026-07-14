import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type IncomingTx = { id: number; description: string; type: 'inntekt' | 'utgift' }
type Category = { id: string; name: string; type: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY er ikke satt på serveren')

    const { transactions, categories } = (await req.json()) as { transactions: IncomingTx[]; categories: Category[] }
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const categoryList = categories.map((c) => `- ${c.name} (${c.type})`).join('\n')
    const lines = transactions
      .map((t) => `[${t.id}] ${t.type === 'inntekt' ? '+' : '-'} "${t.description}"`)
      .join('\n')

    const prompt = `Du er en privatøkonomi-assistent. Kategoriser disse banktransaksjonene for en husstand.

Tilgjengelige kategorier:
${categoryList}

Transaksjoner:
${lines}

Gjør alltid et godt forsøk på å velge den kategorien som passer best, selv om du er usikker —
bruk det du vet om butikk-/leverandørnavn, beløpstype og vanlige norske forbruksmønstre til å
gjette fornuftig. Bruk KUN null i sjeldne unntakstilfeller der beskrivelsen er så generisk
(f.eks. bare et referansenummer) at ingen kategori er rimelig å anta.

Returner KUN et JSON-array, ingen annen tekst:
[{"id": 0, "category_name": "eksakt kategorinavn fra listen, eller null i unntakstilfeller"}]`

    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (response.content[0] as { type: 'text'; text: string }).text
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('AI returnerte ikke gyldig JSON')

    const parsed = JSON.parse(match[0]) as { id: number; category_name: string | null }[]
    const normalize = (s: string) => s.toLowerCase().trim()
    const suggestions = parsed.map((item) => {
      const wanted = item.category_name ? normalize(item.category_name) : null
      const category = wanted ? categories.find((c) => normalize(c.name) === wanted) : undefined
      return { id: item.id, category_id: category?.id ?? null }
    })

    return new Response(JSON.stringify({ suggestions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ukjent feil'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
