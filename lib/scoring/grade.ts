import type { LeadGrade } from "@prisma/client"

/**
 * Grade matrix — two modes:
 *
 * PRE-EXECUTION (preExecution = true)
 *   No calls or WA activity yet. Fit + quality are the primary signals.
 *   Intent only needs to clear a low floor (not zero, not high).
 *
 *   What the numbers mean:
 *   ─────────────────────────────────────────────────────────────────
 *   Fit 70+  = lead CLEARLY matches ICP (industry + geo both confirmed,
 *              plus at least one other dimension)
 *   Fit 55+  = good partial ICP match (e.g. industry + geo only)
 *   Fit 40+  = one strong signal (e.g. just geo match) or no ICP but
 *              enough data to show some alignment
 *   Fit 20+  = minimal signal — could still be worth a call
 *   Fit <20  = no alignment detected → E
 *
 *   Quality 65+ = phone + email + company + inquiry (rich lead data)
 *   Quality 55+ = phone + email + company (standard CSV lead)
 *   Quality 35+ = phone only (minimal data)
 *   Quality 20+ = any valid data (F guard already caught < 20)
 *   ─────────────────────────────────────────────────────────────────
 *
 *   F  → quality < 20
 *   A  → fit ≥ 70 AND quality ≥ 65 AND intent ≥ 15
 *   B  → fit ≥ 55 AND quality ≥ 55 AND intent ≥ 10
 *   C  → fit ≥ 40 AND quality ≥ 35
 *   D  → fit ≥ 20 AND quality ≥ 20
 *   E  → fallback
 *
 * POST-EXECUTION (preExecution = false, default)
 *   Rep has logged activity. All three dimensions are weighted equally.
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
    if (fit >= 70 && quality >= 65 && intent >= 15) return "A"
    if (fit >= 55 && quality >= 55 && intent >= 10) return "B"
    if (fit >= 40 && quality >= 35)                 return "C"
    if (fit >= 20 && quality >= 20)                 return "D"
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
