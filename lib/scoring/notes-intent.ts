/**
 * Keyword-based intent boost from inquiry text / notes.
 *
 * Applied at import time when explicit signal columns (interest_level,
 * last_contact_days) are absent — gives the intent score a real signal
 * from free-text notes the rep already wrote.
 *
 * Rules fire independently (all matching rules are summed).
 * Positive signals are additive; the negative signal is always applied
 * if the keyword is present, regardless of positive matches.
 *
 *   "ready to close"  → +40
 *   "site visit"      → +25
 *   "demo"            → +20
 *   "callback"        → +15
 *   "not interested"  → -20
 */
export function scoreNotesIntent(notes: string | null | undefined): number {
  if (!notes || !notes.trim()) return 0

  const text = notes.toLowerCase()
  let score = 0

  if (/\bready\s+to\s+close\b/.test(text)) score += 40
  if (/\bsite\s+visit\b/.test(text))        score += 25
  if (/\bdemo\b/.test(text))                score += 20
  if (/\bcallback\b|\bcall\s*back\b/.test(text)) score += 15
  if (/\bnot\s+interested\b/.test(text))    score -= 20

  return score
}
