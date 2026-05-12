import { describe, it, expect } from "vitest"
import { computeAiScore, aiScoreBand, AI_SCORE_WEIGHTS } from "../ai-score"

describe("AI_SCORE_WEIGHTS", () => {
  it("weights sum to 1.0", () => {
    const sum = AI_SCORE_WEIGHTS.intent + AI_SCORE_WEIGHTS.fit + AI_SCORE_WEIGHTS.quality
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it("is intent-heavy by design (intent >= fit >= quality)", () => {
    expect(AI_SCORE_WEIGHTS.intent).toBeGreaterThanOrEqual(AI_SCORE_WEIGHTS.fit)
    expect(AI_SCORE_WEIGHTS.fit).toBeGreaterThanOrEqual(AI_SCORE_WEIGHTS.quality)
  })
})

describe("computeAiScore", () => {
  it("returns 100 for perfect inputs", () => {
    expect(computeAiScore({ fit: 100, intent: 100, quality: 100 })).toBe(100)
  })

  it("returns 0 for zero inputs", () => {
    expect(computeAiScore({ fit: 0, intent: 0, quality: 0 })).toBe(0)
  })

  it("weighs intent more than fit", () => {
    // Lead A: high intent, low fit
    const a = computeAiScore({ fit: 30, intent: 90, quality: 50 })
    // Lead B: low intent, high fit (mirror image)
    const b = computeAiScore({ fit: 90, intent: 30, quality: 50 })
    expect(a).toBeGreaterThan(b)
  })

  it("clamps to [0, 100]", () => {
    expect(computeAiScore({ fit: 999, intent: 999, quality: 999 })).toBe(100)
    expect(computeAiScore({ fit: -50, intent: -50, quality: -50 })).toBe(0)
  })

  it("manual arithmetic check", () => {
    // 0.5×80 + 0.3×60 + 0.2×40 = 40 + 18 + 8 = 66
    expect(computeAiScore({ fit: 60, intent: 80, quality: 40 })).toBe(66)
  })
})

describe("aiScoreBand", () => {
  it("maps to 4 bands", () => {
    expect(aiScoreBand(95)).toBe("great")
    expect(aiScoreBand(75)).toBe("good")
    expect(aiScoreBand(60)).toBe("ok")
    expect(aiScoreBand(40)).toBe("low")
  })

  it("boundaries are inclusive at the bottom", () => {
    expect(aiScoreBand(85)).toBe("great")
    expect(aiScoreBand(70)).toBe("good")
    expect(aiScoreBand(55)).toBe("ok")
    expect(aiScoreBand(0)).toBe("low")
  })
})
