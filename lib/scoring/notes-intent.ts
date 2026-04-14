import type { LeadGrade } from "@prisma/client"

/**
 * Keyword-based intent boost from inquiry text / notes.
 *
 * Applied at import time when explicit signal columns (interest_level,
 * last_contact_days) are absent — gives the intent score a real signal
 * from free-text notes the rep already wrote.
 *
 * Rules fire independently (all matching rules are summed).
 * Positive signals are additive; negative signals are always applied
 * if the keyword is present, regardless of positive matches.
 *
 * POSITIVE:
 *   "ready to close" / "ready to buy"                → +50
 *   "booked" / "confirmed booking"                   → +45
 *   "site visit"                                     → +35
 *   "demo" / "booked demo"                           → +25
 *   "callback" / "call back"                         → +20
 *   "pricing" / "rate" / "quotation" / "quote" / "cost" → +15
 *   "interested" / "looking for" / "need" / "want"   → +8
 *
 * NEGATIVE:
 *   "not interested"           → -40
 *   "do not contact" / "dnd"  → -35
 *   "wrong number"             → -30
 *   "no response"              → -25
 */
export function scoreNotesIntent(notes: string | null | undefined): number {
  if (!notes || !notes.trim()) return 0

  const t = notes.toLowerCase()
  let score = 0

  // Strong positive signals
  if (t.includes("ready"))       score += 50
  if (t.includes("confirmed"))   score += 45
  if (t.includes("booked"))      score += 45
  if (t.includes("site"))        score += 35
  if (t.includes("demo"))        score += 25
  if (t.includes("callback"))    score += 20
  if (t.includes("call back"))   score += 20

  // Mid-level signals
  if (t.includes("pricing"))     score += 15
  if (t.includes("rate"))        score += 15
  if (t.includes("quotation"))   score += 15
  if (t.includes("quote"))       score += 15
  if (t.includes("cost"))        score += 15

  // Low-level signals
  if (t.includes("interested"))  score += 8
  if (t.includes("looking for")) score += 8
  if (t.includes("need"))        score += 8
  if (t.includes("want"))        score += 8

  // Negative signals
  if (t.includes("not interested")) score -= 40
  if (t.includes("do not contact")) score -= 35
  if (t.includes("dnd"))            score -= 35
  if (t.includes("wrong number"))   score -= 30
  if (t.includes("no response"))    score -= 25

  return score
}

// ─────────────────────────────────────────────────────────────────────────────
// Hard grade overrides
// ─────────────────────────────────────────────────────────────────────────────

export interface NotesGradeOverride {
  grade:       LeadGrade
  intentScore: number
}

/**
 * Hard keyword-to-grade mapping — bypasses all threshold math.
 *
 * This is a ranking signal, not a precision scorer. If the notes clearly
 * say the lead is hot or dead, we trust that over computed scores.
 *
 * Priority: negative overrides are checked first (they always win).
 * First matching rule wins — returns null when no keyword matches.
 *
 * NEGATIVE (grade suppression):
 *   "not interested" / "do not contact" / "dnd" / "wrong number" → E, intent=5
 *   "no response"                                                  → D, intent=15
 *
 * POSITIVE (grade elevation):
 *   "ready to close" / "ready to buy"   → A, intent=90
 *   "booked demo" / "confirmed booking" → A, intent=85
 *   "site visit"                        → B, intent=70
 */
export function getNotesGradeOverride(
  notes: string | null | undefined,
): NotesGradeOverride | null {
  if (!notes || !notes.trim()) return null

  // Simple partial matching (.includes) — bulletproof against case and phrase variation
  const t = notes.toLowerCase()

  // Negative overrides — checked first, always win
  if (t.includes("not interested"))   return { grade: "E", intentScore: 5 }
  if (t.includes("do not contact"))   return { grade: "E", intentScore: 5 }
  if (t.includes("dnd"))              return { grade: "E", intentScore: 5 }
  if (t.includes("wrong number"))     return { grade: "E", intentScore: 5 }
  if (t.includes("no response"))      return { grade: "D", intentScore: 15 }

  // Positive overrides
  if (t.includes("ready"))            return { grade: "A", intentScore: 95 }
  if (t.includes("booked demo"))      return { grade: "A", intentScore: 85 }
  if (t.includes("confirmed"))        return { grade: "A", intentScore: 85 }
  if (t.includes("demo"))             return { grade: "A", intentScore: 85 }
  if (t.includes("site"))             return { grade: "B", intentScore: 70 }
  if (t.includes("callback"))         return { grade: "B", intentScore: 65 }

  return null
}
