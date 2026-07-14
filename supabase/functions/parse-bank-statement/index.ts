import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Category = { id: string; name: string; type: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY er ikke satt på serveren')

    const formData = await req.formData()
    const file = formData.get('file') as File
    const categoriesJson = formData.get('categories') as string
    if (!file) throw new Error('Ingen fil mottatt')
    const categories = JSON.parse(categoriesJson || '[]') as Category[]

    const categoryList = categories.map((c) => `- ${c.name} (${c.type})`).join('\n')
    const prompt = `Du er en privatøkonomi-assistent. Les denne kontoutskriften/kortoversikten og trekk ut alle transaksjoner.

Tilgjengelige kategorier:
${categoryList}

Returner KUN et JSON-objekt, ingen annen tekst:
{"transactions": [{"date": "YYYY-MM-DD", "description": "...", "amount": 123.45, "type": "utgift eller inntekt", "category_name": "eksakt kategorinavn eller null"}]}

Regler: "amount" alltid positivt. "type" er "utgift" hvis penger forlater kontoen/kortet, "inntekt" hvis penger kommer inn.
Ta med ALLE transaksjoner. Gjør alltid et godt forsøk på "category_name" ut fra butikk-/leverandørnavn og vanlige norske
forbruksmønstre, selv om du er usikker — bruk kun null i sjeldne unntakstilfeller der beskrivelsen er for generisk til at
noen kategori er rimelig å anta.`

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const anthropic = new Anthropic({ apiKey })

    let content
    if (isPdf) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: btoa(binary) } },
        { type: 'text', text: prompt },
      ]
    } else {
      const text = await file.text()
      content = [{ type: 'text', text: `Kontoutskrift:\n\n${text}\n\n${prompt}` }]
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content: content as never }],
    })

    const text = (response.content[0] as { type: 'text'; text: string }).text
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI returnerte ikke strukturert JSON — prøv CSV-eksport i stedet')

    const parsed = JSON.parse(match[0]) as { transactions: { date: string; description: string; amount: number; type: string; category_name: string | null }[] }
    const normalize = (s: string) => s.toLowerCase().trim()
    const transactions = parsed.transactions.map((t) => {
      const wanted = t.category_name ? normalize(t.category_name) : null
      const category = wanted ? categories.find((c) => normalize(c.name) === wanted && c.type === t.type) : undefined
      return { ...t, category_id: category?.id ?? null }
    })

    return new Response(JSON.stringify({ transactions }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ukjent feil'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
