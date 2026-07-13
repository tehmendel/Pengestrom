import { supabase } from './supabaseClient'

function normalizeText(value) {
  return (value || '').toLowerCase().trim()
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
  const needle = normalizeText(description).replace(/[%_,()]/g, '')
  if (needle.length < 3) return null

  const { data } = await supabase
    .from('vendors')
    .select('*')
    .eq('household_id', householdId)
    .ilike('normalized_name', `%${needle}%`)
    .order('confidence', { ascending: false })
    .limit(1)

  const match = data?.[0]
  if (match && match.confidence > 0.5) {
    return { categoryId: match.suggested_category_id, source: 'vendor', vendorId: match.id, confidence: match.confidence }
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

export async function recordCorrection({ householdId, description, suggestedCategoryId, actualCategoryId, wasCorrect }) {
  await supabase.from('categorization_log').insert({
    household_id: householdId,
    description,
    suggested_category_id: suggestedCategoryId,
    actual_category_id: actualCategoryId,
    was_correct: wasCorrect,
  })

  if (wasCorrect) return

  const normalized = normalizeText(description).replace(/[%_,()]/g, '').slice(0, 80)
  if (normalized.length < 3) return

  const { data: existing } = await supabase
    .from('vendors')
    .select('*')
    .eq('household_id', householdId)
    .eq('normalized_name', normalized)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('vendors')
      .update({
        suggested_category_id: actualCategoryId,
        transaction_count: existing.transaction_count + 1,
        confidence: Math.min(0.99, existing.confidence + 0.02),
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('vendors').insert({
      household_id: householdId,
      normalized_name: normalized,
      suggested_category_id: actualCategoryId,
      transaction_count: 1,
      confidence: 0.7,
    })
  }
}
