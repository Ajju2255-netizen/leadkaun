import { describe, it, expect } from "vitest"
import { rankInQueue, isAdopted, RECOMMENDATION_TOP_N, type RankCandidate } from "../recommendation-rank"

const D = new Date("2026-06-01T00:00:00Z")
function lead(id: string, fit: number, intent: number, quality: number, value = 0, daysOld = 0): RankCandidate {
  return { id, fit_score: fit, intent_score: intent, quality_score: quality, expected_value: value, imported_at: new Date(D.getTime() - daysOld * 86400000) }
}

describe("rankInQueue", () => {
  it("ranks by ai_score (intent-weighted) descending", () => {
    // ai = intent*0.5 + fit*0.3 + quality*0.2
    const cands = [
      lead("low", 20, 20, 20),   // 20
      lead("mid", 50, 50, 50),   // 50
      lead("hot", 30, 95, 40),   // 0.5*95+0.3*30+0.2*40 = 64.5 → 65
    ]
    expect(rankInQueue("hot", cands)).toBe(1)
    expect(rankInQueue("mid", cands)).toBe(2)
    expect(rankInQueue("low", cands)).toBe(3)
  })

  it("breaks ai_score ties by expected_value desc", () => {
    const cands = [
      lead("cheap", 50, 50, 50, 10_000),
      lead("rich",  50, 50, 50, 500_000),
    ]
    expect(rankInQueue("rich", cands)).toBe(1)
    expect(rankInQueue("cheap", cands)).toBe(2)
  })

  it("returns null when the target isn't in the candidate set", () => {
    expect(rankInQueue("ghost", [lead("a", 50, 50, 50)])).toBeNull()
  })

  it("gives rank 1 for a single-lead queue", () => {
    expect(rankInQueue("only", [lead("only", 10, 10, 10)])).toBe(1)
  })
})

describe("isAdopted", () => {
  it(`treats rank <= ${RECOMMENDATION_TOP_N} as adopted`, () => {
    expect(isAdopted(1)).toBe(true)
    expect(isAdopted(RECOMMENDATION_TOP_N)).toBe(true)
    expect(isAdopted(RECOMMENDATION_TOP_N + 1)).toBe(false)
  })
  it("treats null/undefined as not adopted", () => {
    expect(isAdopted(null)).toBe(false)
    expect(isAdopted(undefined)).toBe(false)
  })
})
