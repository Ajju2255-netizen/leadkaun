import type { LeadGrade } from "@prisma/client"

/**
 * Grade matrix — TAD Section 4.4
 *
 * Evaluated top-down; first match wins.
 *
 * F  → quality < 20 (unusable lead data)
 * A  → fit ≥ 65 AND intent ≥ 60 AND quality ≥ 60
 * B  → fit ≥ 55 AND intent ≥ 40 AND quality ≥ 50
 * C  → fit ≥ 40 AND intent ≥ 55 AND quality ≥ 40  (high-intent, lower fit)
 * D  → fit ≥ 35 AND intent ≥ 25 AND quality ≥ 30
 * E  → everything else
 */
export function assignGrade(
  fit: number,
  intent: number,
  quality: number
): LeadGrade {
  if (quality < 20)                                      return "F"
  if (fit >= 65 && intent >= 60 && quality >= 60)        return "A"
  if (fit >= 55 && intent >= 40 && quality >= 50)        return "B"
  if (fit >= 40 && intent >= 55 && quality >= 40)        return "C"
  if (fit >= 35 && intent >= 25 && quality >= 30)        return "D"
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
