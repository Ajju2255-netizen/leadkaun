/**
 * Priority Queue AI Score — single 0..100 number per lead.
 *
 * Composes the three independent scoring axes (fit / intent / quality) into
 * a single ranking signal for the /queue surface. Weighted toward INTENT
 * because the queue answers "who's hot right now?", not "who's the best
 * theoretical fit?".
 *
 * Distinct from the /api/leads/stats sort blend (40/30/30 fit-heavy), which
 * answers "who's best to invest in long-term". Both are valid views; they
 * just optimise for different questions.
 *
 * Weights are NAMED EXPORTS — tune without touching call sites.
 */

export const AI_SCORE_WEIGHTS = {
  intent:  0.50, // hottest-right-now drives queue order
  fit:     0.30,
  quality: 0.20,
} as const

export interface AiScoreInputs {
  fit:     number  // 0..100
  intent:  number  // 0..100
  quality: number  // 0..100
}

export function computeAiScore({ fit, intent, quality }: AiScoreInputs): number {
  const W = AI_SCORE_WEIGHTS
  const raw = intent * W.intent + fit * W.fit + quality * W.quality
  return Math.max(0, Math.min(100, Math.round(raw)))
}

/** Banding used by the UI to colour the score number. */
export function aiScoreBand(score: number): "great" | "good" | "ok" | "low" {
  if (score >= 85) return "great"
  if (score >= 70) return "good"
  if (score >= 55) return "ok"
  return "low"
}
