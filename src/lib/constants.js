// Shared taxonomies and thresholds that used to be duplicated (or scattered
// as unlabeled magic numbers) across multiple files — one edit here now
// reaches every place that uses them.

// Mirrors accounts.account_type CHECK constraint (0001_init.sql).
export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Brukskonto' },
  { value: 'savings', label: 'Sparekonto' },
  { value: 'loan', label: 'Lån' },
  { value: 'card', label: 'Kredittkort' },
  { value: 'investment', label: 'Fond/aksjer' },
  { value: 'child', label: 'Barnekonto' },
]

// Mirrors assets.category CHECK constraint (0006_wealth_investments_recurring.sql).
// Used by both Accounts.jsx (asset CRUD) and Wealth.jsx (formuefordeling),
// which used to keep independent copies of these labels.
export const ASSET_CATEGORIES = [
  { value: 'property', label: 'Bolig', isLiability: false },
  { value: 'vehicle', label: 'Kjøretøy', isLiability: false },
  { value: 'pension', label: 'Pensjon', isLiability: false },
  { value: 'other_asset', label: 'Annen eiendel', isLiability: false },
  { value: 'other_debt', label: 'Annen gjeld', isLiability: true },
]

// household_net_worth() also reports 'bank' and 'investment', sourced from
// accounts/holdings rather than the assets table — folded in here so
// Wealth.jsx builds its label map from one source instead of two.
export const WEALTH_CATEGORY_LABELS = {
  bank: 'Bankinnskudd',
  investment: 'Verdipapirer',
  ...Object.fromEntries(ASSET_CATEGORIES.map((c) => [c.value, c.label])),
}

// 'pension' er bevisst utelatt: pensjon telles ikke med i formueberegningen
// (household_net_worth() returnerer aldri denne kategorien) — sporing skjer
// på den dedikerte Pensjon-siden i stedet.
export const WEALTH_POSITIVE_CATEGORIES = ['bank', 'investment', 'property', 'vehicle', 'other_asset']

// Mirrors holdings.instrument_type CHECK constraint. 'pensjonsfond' er kun
// brukt av Pension.jsx (fond tilknyttet en pensjonskonto, ikke en vanlig
// investeringskonto) — vises ikke som filtervalg på Investeringer-siden.
export const INSTRUMENT_TYPES = [
  { value: 'fond', label: 'Fond' },
  { value: 'aksje', label: 'Aksje' },
  { value: 'etf', label: 'ETF' },
  { value: 'obligasjon', label: 'Obligasjon' },
  { value: 'krypto', label: 'Krypto' },
]

export const PENSION_INSTRUMENT_TYPE = 'pensjonsfond'

// ── Vendor-learning thresholds ────────────────────────────────────────────
// (categorize.js, vendorRecurrence.js, Vendors.jsx, Import.jsx, MergeVendorModal.jsx)

// A vendor key shorter than this is too generic/unstable to learn from
// reliably (e.g. a leftover single word after stripping dates/numbers).
export const VENDOR_KEY_MIN_LENGTH = 3

// matchAgainstVendors() only trusts a learned mapping once confidence clears
// this bar (auto_approve bypasses it entirely).
export const VENDOR_CONFIDENCE_AUTO_MATCH_THRESHOLD = 0.5
// Confidence step per confirmed-correct outcome, and the ceiling it climbs toward.
export const VENDOR_CONFIDENCE_INCREMENT = 0.2
export const VENDOR_CONFIDENCE_MAX = 0.99
// Starting confidence for a brand-new vendor, and where it resets to after
// being overridden (a notch below "fresh" since it's already been wrong once).
export const VENDOR_CONFIDENCE_FRESH = 0.7
export const VENDOR_CONFIDENCE_RESET_ON_OVERRIDE = 0.6

// A vendor needs at least this many transactions and this much confidence
// before it's suggested as a permanent rule — the same bar also decides
// whether a fresh vendor spotted mid-import is auto-included by default.
export const RULE_SUGGESTION_MIN_COUNT = 2
export const RULE_SUGGESTION_MIN_CONFIDENCE = 0.85

// ── Recurring-expense detection (vendorRecurrence.js) ─────────────────────
export const RECURRING_AMOUNT_TOLERANCE = 0.2 // ±20% of the vendor's median amount
export const RECURRING_CADENCE_WINDOWS = [
  { label: 'Ukentlig', min: 6, max: 8 },
  { label: 'Månedlig', min: 25, max: 35 },
  { label: 'Kvartalsvis', min: 85, max: 100 },
  { label: 'Årlig', min: 350, max: 380 },
]
