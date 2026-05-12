import { describe, it, expect } from "vitest"
import {
  computeRepScore,
  normalizeSpeed,
  REP_SCORE_WEIGHTS,
} from "../rep-score"

describe("normalizeSpeed", () => {
  it("returns 100 for sub-5min response", () => {
    expect(normalizeSpeed(60)).toBe(100)
    expect(normalizeSpeed(300)).toBe(100)
  })
  it("returns 0 for ≥24h response", () => {
    expect(normalizeSpeed(86400)).toBe(0)
    expect(normalizeSpeed(100_000)).toBe(0)
  })
  it("falls log-shaped in between", () => {
    const h1 = normalizeSpeed(3600)    // 1h
    const h6 = normalizeSpeed(21600)   // 6h
    const h12 = normalizeSpeed(43200)  // 12h
    expect(h1).toBeGreaterThan(h6)
    expect(h6).toBeGreaterThan(h12)
    expect(h1).toBeGreaterThan(50)     // 1h response still rewarded
  })
  it("returns neutral 50 for null", () => {
    expect(normalizeSpeed(null)).toBe(50)
  })
})

describe("computeRepScore", () => {
  it("returns 100 for the top performer", () => {
    const { score } = computeRepScore({
      follow_up_pct:    100,
      speed_seconds:    120,    // 2 min → 100
      missed_recov_pct: 100,
      exec_score:       100,
      conv_rate:        100,
    })
    expect(score).toBe(100)
  })

  it("returns 0 for the bottom performer", () => {
    const { score } = computeRepScore({
      follow_up_pct:    0,
      speed_seconds:    86400,
      missed_recov_pct: 0,
      exec_score:       0,
      conv_rate:        0,
    })
    expect(score).toBe(0)
  })

  it("does not punish reps with null data (neutral 50 default)", () => {
    // Brand-new rep — no missed pool, no qualified-stage history yet
    const { score } = computeRepScore({
      follow_up_pct:    80,
      speed_seconds:    600,    // 10 min → still high
      missed_recov_pct: null,
      exec_score:       60,
      conv_rate:        null,
    })
    // Should be solidly above 50 — not dragged to zero by missing data
    expect(score).toBeGreaterThan(50)
  })

  it("each component contributes its weight at full fulfilment", () => {
    const { components } = computeRepScore({
      follow_up_pct:    100,
      speed_seconds:    60,
      missed_recov_pct: 100,
      exec_score:       100,
      conv_rate:        100,
    })
    expect(components.follow_up_pct).toBe(REP_SCORE_WEIGHTS.follow_up_pct)
    expect(components.speed_to_lead).toBe(REP_SCORE_WEIGHTS.speed_to_lead)
    expect(components.missed_value_recov).toBe(REP_SCORE_WEIGHTS.missed_value_recov)
    expect(components.daily_execution).toBe(REP_SCORE_WEIGHTS.daily_execution)
    expect(components.conversion_rate).toBe(REP_SCORE_WEIGHTS.conversion_rate)
  })

  it("weights sum to 100", () => {
    const sum = Object.values(REP_SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })

  it("clamps wild input values", () => {
    const { score } = computeRepScore({
      follow_up_pct:    9999,    // would saturate to 100
      speed_seconds:    -50,     // <= 300 path → 100
      missed_recov_pct: 9999,
      exec_score:       9999,
      conv_rate:        9999,
    })
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})
