import type { QualityScoreInput, QualityScoreResult, QualityScoreBreakdown } from "./types"

// Indian mobile number patterns (post-normalisation to +91XXXXXXXXXX)
const MOBILE_REGEX = /^\+91[6-9]\d{9}$/
// Indian landline pattern: +91 followed by 2–4 digit STD code + local number
const LANDLINE_REGEX = /^\+91[1-5]\d{9}$/

/**
 * Computes the Quality Score (0–100).
 *
 * Components:
 *   phone     0–30  (mobile = 30, landline = 15, invalid = 0)
 *   email     0–15  (present = 15, absent = 0)
 *   company   0–15  (present = 15, absent = 0)
 *   inquiry   0–20  (high specificity = 20, medium = 10, low = 5, none = 0)
 *   source    0–10  (based on source reliability_score / 10)
 *   junk      0 or –10 (any junk flags present)
 *
 * Floor: 0 (no negative total)
 * TAD ref: Section 4.2.3
 */
export function computeQualityScore(input: QualityScoreInput): QualityScoreResult {
  const breakdown: QualityScoreBreakdown = {
    phone:   scorePhone(input.phone),
    email:   input.email ? 15 : 0,
    company: input.company_name ? 15 : 0,
    inquiry: scoreInquiry(input.inquiry_text),
    source:  Math.round(Math.min(input.source_reliability, 100) / 10),
    junk:    (input.is_junk || input.junk_flags.length > 0) ? -10 : 0,
  }

  const raw = Object.values(breakdown).reduce((acc, v) => acc + v, 0)

  return {
    total: Math.min(100, Math.max(0, raw)),
    breakdown,
  }
}

// ─────────────────────────────────────────────
// Component scorers
// ─────────────────────────────────────────────

function scorePhone(phone: string): number {
  if (!phone) return 0
  if (MOBILE_REGEX.test(phone)) return 30   // valid Indian mobile
  if (LANDLINE_REGEX.test(phone)) return 15 // landline — lower quality for sales outreach
  return 0                                   // invalid / unrecognised format
}

function scoreInquiry(text: string | null | undefined): number {
  if (!text || text.trim().length === 0) return 0

  const words = text.trim().split(/\s+/).length
  const hasNumbers = /\d/.test(text)         // specific numbers = high specificity
  const hasPriceIntent = /price|rate|cost|budget|quote|quotation|how much/i.test(text)
  const hasSpecificProduct = /model|product|size|specification|spec|capacity|unit/i.test(text)

  if (words >= 15 || (hasNumbers && hasPriceIntent) || (hasSpecificProduct && words >= 8)) {
    return 20  // high specificity
  }
  if (words >= 6 || hasNumbers || hasPriceIntent || hasSpecificProduct) {
    return 10  // medium specificity
  }
  return 5     // low specificity — just "interested" or similar
}
