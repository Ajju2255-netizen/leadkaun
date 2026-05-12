/**
 * 5-component Rep Score — 0..100 per rep.
 *
 * Blends month-to-date performance signals into a single number that drives
 * the /rep-tracking score ring. Closes deferred QA-AC line 63 ("Rep Score
 * (0-100) computes correctly from 5 weighted components").
 *
 * Composition (sums to 100):
 *   25  follow_up_pct       — month-to-date completion %
 *   20  speed_to_lead       — avg Grade-A response time, log-normalised
 *   15  missed_value_recov  — recovered / (recovered + at-risk) this month
 *   20  daily_execution     — today's execution score (lib/scoring/execution-score)
 *   20  conversion_rate     — won / qualified leads MTD
 *
 * Weights are NAMED EXPORTS — tune without touching call sites. The fifth
 * component slots in cleanly for any future addition.
 */

export const REP_SCORE_WEIGHTS = {
  follow_up_pct:      25,
  speed_to_lead:      20,
  missed_value_recov: 15,
  daily_execution:    20,
  conversion_rate:    20,
} as const

export type RepScoreComponentKey = keyof typeof REP_SCORE_WEIGHTS

export interface RepScoreInputs {
  /** Follow-up completion percentage MTD (0..100). */
  follow_up_pct:  number
  /** Average Grade-A speed-to-lead in seconds. null = no A leads this month. */
  speed_seconds:  number | null
  /** Recovered won_value as % of total at-risk MTD (0..100). null = no data. */
  missed_recov_pct: number | null
  /** Today's execution score (0..100). */
  exec_score:     number
  /** Conversion rate MTD: won / qualified (0..100). null = no qualified yet. */
  conv_rate:      number | null
}

export type RepScoreComponents = Record<RepScoreComponentKey, number>

export interface RepScoreResult {
  score: number
  components: RepScoreComponents
}

/**
 * Normalise speed-to-lead seconds → 0..100 score.
 *   ≤5 min   → 100 (gold standard)
 *   ≥24 h    → 0
 *   Between  → log decay (faster than linear, recognises diminishing returns)
 *   null     → 50 (neutral fallback so missing data doesn't punish reps)
 */
export function normalizeSpeed(seconds: number | null): number {
  if (seconds == null) return 50
  if (seconds <= 300)   return 100
  if (seconds >= 86400) return 0
  const ratio = Math.log(seconds / 300) / Math.log(86400 / 300)
  return Math.round(100 * (1 - ratio))
}

export function computeRepScore(i: RepScoreInputs): RepScoreResult {
  const W = REP_SCORE_WEIGHTS

  // Normalise each input to 0..1 fulfilment
  const fuFull       = clamp01(i.follow_up_pct / 100)
  const speedFull    = clamp01(normalizeSpeed(i.speed_seconds) / 100)
  // null missed_recov => neutral 50 so reps without missed-recovery activity
  // aren't penalised (especially new accounts with no missed pool yet).
  const recovFull    = clamp01(((i.missed_recov_pct ?? 50)) / 100)
  const execFull     = clamp01(i.exec_score / 100)
  // null conv_rate => neutral 50 (account with no qualified-stage data yet)
  const convFull     = clamp01(((i.conv_rate ?? 50)) / 100)

  const components: RepScoreComponents = {
    follow_up_pct:      Math.round(fuFull    * W.follow_up_pct),
    speed_to_lead:      Math.round(speedFull * W.speed_to_lead),
    missed_value_recov: Math.round(recovFull * W.missed_value_recov),
    daily_execution:    Math.round(execFull  * W.daily_execution),
    conversion_rate:    Math.round(convFull  * W.conversion_rate),
  }

  const total =
    components.follow_up_pct +
    components.speed_to_lead +
    components.missed_value_recov +
    components.daily_execution +
    components.conversion_rate

  return { score: Math.max(0, Math.min(100, total)), components }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}
