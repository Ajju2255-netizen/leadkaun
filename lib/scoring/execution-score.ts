/**
 * Daily Execution Score — 0..100 per rep, per day.
 *
 * Composes five components into a single number that answers: "is this rep
 * on pace for the day?" The 3pm IST alert (manager notification when score
 * < 25) reads this; the same value feeds the 4th component of the full Rep
 * Score (lib/scoring/rep-score.ts).
 *
 * Design choices (locked in plan §A):
 *   - Weights are NAMED EXPORTS so you can tune without touching call sites
 *   - Time-of-day aware via expectedProgress() — at 3pm, only ~67% of the
 *     day's targets should be done, so we normalise the ratios accordingly
 *   - Future-proof: adding a 6th component is "add a key + a weight + an
 *     input field"; nothing else changes
 *
 * Signals all already exist in the DB (FollowUpAction, Lead, Signal tables).
 */

export const EXEC_SCORE_WEIGHTS = {
  followups_done_vs_due: 35, // pacing on planned work — most important
  leads_touched:         20, // breadth of activity
  speed_to_lead_today:   20, // freshness on A/B leads received today
  signals_logged:        15, // engagement evidence (calls + WA + notes)
  overdue_penalty:       10, // subtractive: each overdue FU drags the score
} as const

/** Tuning knobs for daily targets. Increase as team scales. */
export const EXEC_SCORE_TARGETS = {
  /** Distinct leads a rep is expected to touch in a full working day. */
  touches_per_day: 8,
  /** Signals (calls + WA + notes) logged per full working day. */
  signals_per_day: 12,
  /** Each overdue follow-up subtracts this much from the overdue component
   *  (clamped at 0). Five overdues = full penalty. */
  overdue_step:    0.2,
} as const

/**
 * Expected fraction of the day's work that should be done by IST hour H.
 *
 * Workday window: 09:30–19:00 IST (~9.5 hours). Linear progression with a
 * 1.15× back-loading bias so 3pm → ~67%, 4pm → ~79%. Below the window the
 * expectation is 0 (don't penalise sleeping); above it 1.
 */
export function expectedProgress(hourIST: number): number {
  if (hourIST < 9.5) return 0
  if (hourIST >= 19) return 1
  return Math.min(1, ((hourIST - 9.5) / 9.5) * 1.15)
}

export interface ExecScoreInputs {
  /** Follow-ups with due_date inside today (IST). */
  fu_due_today:        number
  /** Of those, the count completed (status=COMPLETED, completed_at today). */
  fu_completed_today:  number
  /** Current OVERDUE count for this rep (regardless of when it went overdue). */
  fu_overdue_now:      number
  /** Distinct leads with last_action_at >= startOfIstDay(). */
  leads_touched_today: number
  /** Grade-A/B leads imported today and assigned to this rep. */
  ab_leads_today:      number
  /** Of those, how many have first_contact_at set (i.e. were contacted). */
  ab_leads_contacted:  number
  /** Signal rows authored by rep with created_at >= startOfIstDay(). */
  signals_today:       number
  /** Current IST hour (e.g. 15.0 at 3pm). */
  hour_ist:            number
}

export type ExecScoreComponents = Record<keyof typeof EXEC_SCORE_WEIGHTS, number>

export interface ExecScoreResult {
  score: number
  components: ExecScoreComponents
}

/** 0..100 daily execution score with per-component breakdown. */
export function computeExecutionScore(i: ExecScoreInputs): ExecScoreResult {
  const W = EXEC_SCORE_WEIGHTS
  const T = EXEC_SCORE_TARGETS
  const exp = Math.max(expectedProgress(i.hour_ist), 0.01) // avoid /0 at sunrise

  // 1. Follow-ups: ratio normalised to time-of-day expectation
  const fuRatio = i.fu_due_today > 0 ? i.fu_completed_today / i.fu_due_today : 1
  const fuC = Math.min(1, fuRatio / exp)

  // 2. Leads touched vs expected (target * exp)
  const touchC = Math.min(1, i.leads_touched_today / (T.touches_per_day * exp))

  // 3. Speed-to-lead today: fraction of A/B leads contacted; 1 if none yet
  const speedC = i.ab_leads_today > 0
    ? i.ab_leads_contacted / i.ab_leads_today
    : 1

  // 4. Signals logged vs expected
  const signalsC = Math.min(1, i.signals_today / (T.signals_per_day * exp))

  // 5. Overdue penalty (1 = no overdues, 0 = many)
  const overdueC = Math.max(0, 1 - i.fu_overdue_now * T.overdue_step)

  const partials: ExecScoreComponents = {
    followups_done_vs_due: Math.round(fuC      * W.followups_done_vs_due),
    leads_touched:         Math.round(touchC   * W.leads_touched),
    speed_to_lead_today:   Math.round(speedC   * W.speed_to_lead_today),
    signals_logged:        Math.round(signalsC * W.signals_logged),
    overdue_penalty:       Math.round(overdueC * W.overdue_penalty),
  }

  const total =
    partials.followups_done_vs_due +
    partials.leads_touched +
    partials.speed_to_lead_today +
    partials.signals_logged +
    partials.overdue_penalty

  return {
    score: Math.max(0, Math.min(100, total)),
    components: partials,
  }
}

/** Convenience banding for UI. Keep aligned with palette in App-Patterns.md. */
export function scoreBand(score: number): "critical" | "low" | "ok" | "good" | "great" {
  if (score < 25) return "critical"
  if (score < 50) return "low"
  if (score < 70) return "ok"
  if (score < 85) return "good"
  return "great"
}
