import { supabase } from './supabaseClient'

function normalizeText(value) {
  return (value || '').toLowerCase().trim()
}

// Card/bank descriptions carry a lot of volatile noise around the merchant
// name (leading date, trailing KID/reference numbers, addresses). Matching
// on the raw description means the same vendor almost never matches twice.
// This pulls out a short, stable key so repeat vendors actually collapse
// to one learned mapping instead of each transaction looking "new".
export function extractVendorKey(description) {
  let text = normalizeText(description)
  text = text.replace(/^\d{1,2}\.\d{1,2}\.?\s+/, '') // leading "dd.mm " date
  text = text.replace(/\b\d{6,}\b/g, ' ') // long reference/KID numbers
  text = text.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim()
  return text.split(' ').slice(0, 3).join(' ')
}

export async function fetchActiveRules(householdId) {
  const { data } = await supabase
    .from('categorization_rules')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)
    .order('priority', { ascending: true })
  return data || []
}

export function matchAgainstRules(rules, description, type) {
  const text = normalizeText(description)
  for (const rule of rules) {
    if (rule.transaction_type && rule.transaction_type !== type) continue
    const needle = normalizeText(rule.match_value)
    const hit =
      rule.match_type === 'exact' ? text === needle :
      rule.match_type === 'starts_with' ? text.startsWith(needle) :
      text.includes(needle)
    if (hit) return { categoryId: rule.category_id, source: 'rule', ruleId: rule.id }
  }
  return null
}

export async function matchAgainstVendors(householdId, description) {
  const key = extractVendorKey(description)
  if (key.length < 3) return null

  const { data } = await supabase
    .from('vendors')
    .select('*')
    .eq('household_id', householdId)
    .eq('normalized_name', key)
    .maybeSingle()

  if (data && data.confidence > 0.5) {
    return { categoryId: data.suggested_category_id, source: 'vendor', vendorId: data.id, confidence: data.confidence }
  }
  return null
}

export async function suggestCategory({ householdId, description, type, rules }) {
  const ruleHit = matchAgainstRules(rules, description, type)
  if (ruleHit) return ruleHit

  const vendorHit = await matchAgainstVendors(householdId, description)
  if (vendorHit) return vendorHit

  return { categoryId: null, source: 'none' }
}

// Learns from what actually happened to a transaction, whether the user
// confirmed the suggestion (rule/vendor/AI) or overrode it with something
// else. Confidence climbs a little further every time a vendor's mapping
// is confirmed again, and resets lower (but not to zero) when it's wrong —
// so frequently-seen vendors become steadily more trusted over time instead
// of hitting the AI cold on every import.
export async function learnFromOutcome({ householdId, description, suggestedCategoryId, finalCategoryId }) {
  if (!finalCategoryId) return

  const wasCorrect = suggestedCategoryId === finalCategoryId

  await supabase.from('categorization_log').insert({
    household_id: householdId,
    description,
    suggested_category_id: suggestedCategoryId,
    actual_category_id: finalCategoryId,
    was_correct: wasCorrect,
  })

  const key = extractVendorKey(description)
  if (key.length < 3) return

  const { data: existing } = await supabase
    .from('vendors')
    .select('*')
    .eq('household_id', householdId)
    .eq('normalized_name', key)
    .maybeSingle()

  if (existing && existing.suggested_category_id === finalCategoryId) {
    await supabase.from('vendors').update({
      transaction_count: existing.transaction_count + 1,
      confidence: Math.min(0.99, Number(existing.confidence) + 0.03),
      last_seen: new Date().toISOString().slice(0, 10),
    }).eq('id', existing.id)
  } else if (existing) {
    // Vendor previously pointed elsewhere and just proved wrong — retarget,
    // starting a notch below the fresh-vendor baseline since it's been wrong once.
    await supabase.from('vendors').update({
      suggested_category_id: finalCategoryId,
      transaction_count: existing.transaction_count + 1,
      confidence: 0.6,
      last_seen: new Date().toISOString().slice(0, 10),
    }).eq('id', existing.id)
  } else {
    await supabase.from('vendors').insert({
      household_id: householdId,
      normalized_name: key,
      suggested_category_id: finalCategoryId,
      transaction_count: 1,
      confidence: 0.7,
      last_seen: new Date().toISOString().slice(0, 10),
    })
  }
}
