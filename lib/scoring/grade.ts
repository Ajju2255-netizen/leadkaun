import type { LeadGrade } from "@prisma/client"

/**
 * Grade matrix — two modes:
 *
 * PRE-EXECUTION (preExecution = true)
 *   No calls or WA activity logged yet — fit + quality are primary signals.
 *   Intent threshold is minimal because the rep has not contacted the lead.
 *
 *   F  → quality < 20
 *   A  → fit ≥ 50 AND quality ≥ 50 AND intent ≥ 10
 *   B  → fit ≥ 40 AND quality ≥ 40 AND intent ≥ 5
 *   C  → fit ≥ 30
 *   D  → fit ≥ 20
 *   E  → fallback
 *
 * POST-EXECUTION (preExecution = false, default)
 *   Rep has logged activity — all three dimensions are weighted.
 *
 *   F  → quality < 20
 *   A  → fit ≥ 65 AND intent ≥ 60 AND quality ≥ 60
 *   B  → fit ≥ 55 AND intent ≥ 40 AND quality ≥ 50
 *   C  → fit ≥ 40 AND intent ≥ 30 AND quality ≥ 40
 *   D  → fit ≥ 30 AND intent ≥ 15 AND quality ≥ 25
 *   E  → fallback
 */
export function assignGrade(
  fit: number,
  intent: number,
  quality: number,
  preExecution = false,
): LeadGrade {
  if (quality < 20) return "F"

  if (preExecution) {
    if (fit >= 50 && quality >= 50 && intent >= 10) return "A"
    if (fit >= 40 && quality >= 40 && intent >= 5)  return "B"
    if (fit >= 30)                                  return "C"
    if (fit >= 20)                                  return "D"
    return "E"
  }

  // Post-execution thresholds
  if (fit >= 65 && intent >= 60 && quality >= 60) return "A"
  if (fit >= 55 && intent >= 40 && quality >= 50) return "B"
  if (fit >= 40 && intent >= 30 && quality >= 40) return "C"
  if (fit >= 30 && intent >= 15 && quality >= 25) return "D"
  return "E"
}

/**
 * Returns true if the lead has crossed the SQL (Sales Qualified Lead) threshold.
 * Both fit AND intent must independently clear their account-configured thresholds.
 *
 * Defaults: fit_threshold = 55, intent_threshold = 45 (Account model defaults)
 * TAD ref: Section 4.4.1
 */
export function checkSqlThreshold(
  fit: number,
  intent: number,
  sqlFitThreshold: number,
  sqlIntentThreshold: number,
): boolean {
  return fit >= sqlFitThreshold && intent >= sqlIntentThreshold
}
