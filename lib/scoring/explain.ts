// ─────────────────────────────────────────────
// SCORE EXPLANATION
// Turns the stored fit/quality breakdowns + scores into human-readable,
// per-factor reasons and a plain-English grade rationale. Pure & dependency
// free so it can be unit-tested and reused on server or client.
//
// Addresses the "black box scoring" trust gap: a rep should see WHY a lead is
// graded the way it is, what's dragging it down, and what to do about it.
// ─────────────────────────────────────────────

export type FactorTone = "good" | "ok" | "weak" | "none"

export type ScoreFactor = {
  key: string
  label: string
  points: number
  max: number
  tone: FactorTone
  note: string
}

export type ScoreDimension = "fit" | "intent" | "quality"

export type ScoreExplanation = {
  grade: string
  fit: { score: number; factors: ScoreFactor[] }
  quality: { score: number; factors: ScoreFactor[] }
  intent: { score: number; note: string }
  /** The lowest-scoring dimension — the main thing holding the grade back. */
  limiting: ScoreDimension
  /** One-line, plain-English rationale a rep can act on. */
  summary: string
  /** True when no stored breakdown was available (older, un-rescored lead). */
  breakdownMissing: boolean
}

export type ExplainInput = {
  grade: string
  fit_score: number
  intent_score: number
  quality_score: number
  fit_score_breakdown?: unknown
  quality_score_breakdown?: unknown
}

const FIT_FACTORS: { key: string; label: string; max: number }[] = [
  { key: "industry",      label: "Industry",        max: 30 },
  { key: "geography",     label: "Geography",       max: 20 },
  { key: "business_type", label: "Business type",   max: 20 },
  { key: "role",          label: "Role / seniority", max: 15 },
  { key: "budget",        label: "Budget fit",      max: 15 },
]

const QUALITY_FACTORS: { key: string; label: string; max: number }[] = [
  { key: "phone",   label: "Phone",             max: 30 },
  { key: "email",   label: "Email",             max: 15 },
  { key: "company", label: "Company",           max: 15 },
  { key: "inquiry", label: "Inquiry detail",    max: 20 },
  { key: "source",  label: "Source reliability", max: 10 },
]

function num(obj: unknown, key: string): number | null {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key]
    if (typeof v === "number" && Number.isFinite(v)) return v
  }
  return null
}

function toneFor(points: number, max: number): FactorTone {
  if (max <= 0) return points < 0 ? "weak" : "none"
  const frac = points / max
  if (frac >= 0.8) return "good"
  if (frac >= 0.4) return "ok"
  if (frac > 0) return "weak"
  return "none"
}

function fitNote(key: string, tone: FactorTone): string {
  if (tone === "good") return "Matches your ICP"
  if (tone === "ok") return "Partial match"
  if (tone === "weak") return "Weak or inferred"
  // none
  return key === "budget" ? "Outside range or no value" : "No match or missing data"
}

function qualityNote(key: string, points: number): string {
  switch (key) {
    case "phone":   return points >= 30 ? "Valid mobile" : points >= 15 ? "Landline" : "Missing or invalid"
    case "email":   return points > 0 ? "Provided" : "Missing — enrich to improve"
    case "company": return points > 0 ? "Provided" : "Missing — enrich to improve"
    case "inquiry": return points >= 20 ? "Detailed" : points >= 10 ? "Some detail" : points > 0 ? "Minimal" : "None provided"
    case "source":  return points >= 7 ? "Reliable source" : points > 0 ? "Mixed source" : "Low-trust source"
    default:        return ""
  }
}

function intentNote(score: number): string {
  if (score >= 60) return "Strong recent engagement"
  if (score >= 30) return "Some engagement logged"
  return "No recent engagement — reflects source baseline. Log calls/WhatsApp to raise it."
}

function buildFactors(
  defs: { key: string; label: string; max: number }[],
  breakdown: unknown,
  note: (key: string, points: number, tone: FactorTone) => string,
): ScoreFactor[] {
  const factors: ScoreFactor[] = []
  for (const def of defs) {
    const points = num(breakdown, def.key)
    if (points === null) continue
    const tone = toneFor(points, def.max)
    factors.push({ ...def, points, tone, note: note(def.key, points, tone) })
  }
  return factors
}

/**
 * Build a structured, human-readable explanation of a lead's grade from its
 * stored scores and breakdowns.
 */
export function buildScoreExplanation(input: ExplainInput): ScoreExplanation {
  const fit = Math.round(input.fit_score)
  const intent = Math.round(input.intent_score)
  const quality = Math.round(input.quality_score)

  const fitFactors = buildFactors(FIT_FACTORS, input.fit_score_breakdown, (k, _p, t) => fitNote(k, t))
  const qualityFactors = buildFactors(QUALITY_FACTORS, input.quality_score_breakdown, (k, p) => qualityNote(k, p))

  // Junk penalty is only worth surfacing when it actually applies.
  const junk = num(input.quality_score_breakdown, "junk")
  if (junk !== null && junk < 0) {
    qualityFactors.push({ key: "junk", label: "Junk penalty", points: junk, max: 0, tone: "weak", note: "Flagged as junk / low quality" })
  }

  const breakdownMissing = fitFactors.length === 0 && qualityFactors.length === 0

  // Limiting dimension = the lowest of the three (ties resolve intent → fit → quality,
  // since engagement is the most actionable lever for a rep).
  const lowest = Math.min(fit, intent, quality)
  const limiting: ScoreDimension = intent === lowest ? "intent" : fit === lowest ? "fit" : "quality"

  const limitText: Record<ScoreDimension, string> = {
    intent: "Intent is the limiting factor — little or no recent engagement is logged. Log calls and WhatsApp replies to raise it.",
    fit:    "Fit is the limiting factor — this lead only partially matches your ICP, so it can't grade higher on profile alone.",
    quality: "Data quality is the limiting factor — key fields are missing. Enrich the lead (email, company, designation) to improve its grade.",
  }

  return {
    grade: input.grade,
    fit: { score: fit, factors: fitFactors },
    quality: { score: quality, factors: qualityFactors },
    intent: { score: intent, note: intentNote(intent) },
    limiting,
    summary: `Graded ${input.grade}. ${limitText[limiting]}`,
    breakdownMissing,
  }
}
