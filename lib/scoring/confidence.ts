// ─────────────────────────────────────────────
// CONFIDENCE SCORE  +  NEEDS ENRICHMENT
//
// Confidence is SEPARATE from the grade. The grade says "how good is this
// lead"; confidence says "how much do we actually know". A thin lead (name +
// email only) shouldn't read as a bad lead — it should read as "we don't have
// enough information yet". This reframes the thin-CSV problem and is the
// foundation of trust.
//
// Derived purely from which accuracy-driving fields are populated — no schema
// change, no stored column. Pure & dependency-free so it can be unit-tested
// and reused on server or client.
// ─────────────────────────────────────────────

export type ConfidenceBand = "high" | "moderate" | "low" | "very_low"

export type EnrichField = {
  key: string
  label: string
  /** Accuracy weight — how many confidence points this field is worth. */
  weight: number
  /** Short call-to-action shown in the "needs enrichment" checklist. */
  hint: string
}

export type ConfidenceResult = {
  /** 0–100. How complete the accuracy-driving data is. */
  score: number
  band: ConfidenceBand
  /** True when data is too thin to fully trust the grade. */
  needsEnrichment: boolean
  /** Fields we have (for "what we know"). */
  present: EnrichField[]
  /** Fields we're missing, highest-impact first (for the enrichment checklist). */
  missing: EnrichField[]
  /** One-line, plain-English reason a rep can act on. */
  reason: string
}

export type ConfidenceInput = {
  first_name?: string | null
  phone?: string | null
  email?: string | null
  company_name?: string | null
  designation?: string | null
  city?: string | null
  state?: string | null
  expected_value?: number | null
  inquiry_text?: string | null
}

// Weights sum to 100. name + phone are (almost) always present at import, so
// they form a ~20pt floor; the rest is what enrichment actually adds. Tuned so
// "name + phone + email" lands ~30%, matching the founder's reference example.
type FieldDef = EnrichField & {
  enrichable: boolean // false for fields that are always present / not user-addable here
  has: (l: ConfidenceInput) => boolean
}

const FIELDS: FieldDef[] = [
  { key: "name",        label: "Name",                weight: 8,  enrichable: false, hint: "",                          has: (l) => !!l.first_name?.trim() },
  { key: "phone",       label: "Phone",               weight: 12, enrichable: false, hint: "",                          has: (l) => !!l.phone?.trim() },
  { key: "company",     label: "Company",             weight: 22, enrichable: true,  hint: "Add the company name",      has: (l) => !!l.company_name?.trim() },
  { key: "designation", label: "Role / designation",  weight: 18, enrichable: true,  hint: "Add their role / title",    has: (l) => !!l.designation?.trim() },
  { key: "location",    label: "Location",            weight: 12, enrichable: true,  hint: "Add city or state",         has: (l) => !!(l.state?.trim() || l.city?.trim()) },
  { key: "inquiry",     label: "Inquiry detail",      weight: 10, enrichable: true,  hint: "Add what they asked for",   has: (l) => !!l.inquiry_text?.trim() },
  { key: "email",       label: "Email",               weight: 10, enrichable: true,  hint: "Add an email address",      has: (l) => !!l.email?.trim() },
  { key: "budget",      label: "Budget / deal value", weight: 8,  enrichable: true,  hint: "Add expected deal value",   has: (l) => l.expected_value != null && l.expected_value > 0 },
]

function bandFor(score: number): ConfidenceBand {
  if (score >= 75) return "high"
  if (score >= 50) return "moderate"
  if (score >= 30) return "low"
  return "very_low"
}

const NEEDS_ENRICHMENT_BELOW = 50

/**
 * Compute a lead's data-confidence and what to enrich to raise it.
 */
export function computeConfidence(lead: ConfidenceInput): ConfidenceResult {
  const present: EnrichField[] = []
  const missing: EnrichField[] = []
  let score = 0

  for (const f of FIELDS) {
    const ef: EnrichField = { key: f.key, label: f.label, weight: f.weight, hint: f.hint }
    if (f.has(lead)) {
      score += f.weight
      present.push(ef)
    } else if (f.enrichable) {
      missing.push(ef)
    }
  }

  // Highest-impact gaps first, so the checklist leads with the biggest win.
  missing.sort((a, b) => b.weight - a.weight)

  const band = bandFor(score)
  const needsEnrichment = score < NEEDS_ENRICHMENT_BELOW

  let reason: string
  if (missing.length === 0) {
    reason = "Full data coverage — the grade is based on complete information."
  } else if (needsEnrichment) {
    const top = missing.slice(0, 3).map((m) => m.label.toLowerCase())
    reason = `Limited data — add ${joinAnd(top)} to improve accuracy.`
  } else {
    const top = missing.slice(0, 2).map((m) => m.label.toLowerCase())
    reason = `Good coverage. Add ${joinAnd(top)} for an even more accurate grade.`
  }

  return { score, band, needsEnrichment, present, missing, reason }
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`
}
