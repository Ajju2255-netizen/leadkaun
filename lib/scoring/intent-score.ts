import { DECAY_RATE_PER_DAY, DECAY_THRESHOLD_DAYS } from "./signal-weights"
import type { IntentScoreInput } from "./types"

/**
 * Computes the Intent Score (0–100).
 *
 * Algorithm:
 * 1. Start from source baseline (set at import via SOURCE_BASELINE signal)
 * 2. Aggregate all signal_value contributions
 * 3. Apply time-based decay: -3pts/day after the sales-cycle threshold,
 *    counting from the last positive signal (or import_at if no signals)
 * 4. Floor = source_baseline (intent never drops below where the lead started)
 * 5. Cap = 100
 *
 * TAD ref: Section 4.3
 */
export function computeIntentScore(input: IntentScoreInput): number {
  const { signals, source_baseline, sales_cycle, imported_at } = input

  // 1. Sum all signal contributions
  const rawTotal = signals.reduce((acc, s) => acc + s.signal_value, 0)

  // 2. Apply decay based on days since last positive signal
  const decayPenalty = computeDecayPenalty(signals, sales_cycle, imported_at)

  const score = rawTotal - decayPenalty

  // 3. Clamp between floor (source_baseline) and 100
  return clamp(score, source_baseline, 100)
}

/**
 * Computes how many intent points should be deducted due to inactivity decay.
 *
 * Decay starts after `DECAY_THRESHOLD_DAYS[sales_cycle]` days have passed
 * since the last positive signal. Each additional day costs DECAY_RATE_PER_DAY points.
 */
function computeDecayPenalty(
  signals: IntentScoreInput["signals"],
  sales_cycle: IntentScoreInput["sales_cycle"],
  imported_at: Date,
): number {
  const thresholdDays = DECAY_THRESHOLD_DAYS[sales_cycle] ?? 28
  const now = new Date()

  // Find the most recent signal with a positive value
  const positiveSignals = signals
    .filter((s) => s.signal_value > 0)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())

  const lastPositiveAt = positiveSignals[0]?.created_at ?? imported_at

  const daysSinceLastPositive = daysBetween(lastPositiveAt, now)

  if (daysSinceLastPositive <= thresholdDays) return 0

  const decayDays = daysSinceLastPositive - thresholdDays
  return Math.round(decayDays * DECAY_RATE_PER_DAY)
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)))
}
