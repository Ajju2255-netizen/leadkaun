import { describe, it, expect } from "vitest"
import { buildScoreExplanation } from "../explain"

describe("buildScoreExplanation", () => {
  it("maps fit + quality breakdowns into labeled factors with tones", () => {
    const exp = buildScoreExplanation({
      grade: "B",
      fit_score: 72,
      intent_score: 18,
      quality_score: 65,
      fit_score_breakdown: { industry: 30, geography: 20, business_type: 5, role: 2, budget: 15 },
      quality_score_breakdown: { phone: 30, email: 15, company: 0, inquiry: 5, source: 0, junk: 0 },
    })

    expect(exp.fit.factors).toHaveLength(5)
    const industry = exp.fit.factors.find((f) => f.key === "industry")!
    expect(industry).toMatchObject({ points: 30, max: 30, tone: "good" })

    const company = exp.quality.factors.find((f) => f.key === "company")!
    expect(company).toMatchObject({ points: 0, tone: "none" })
    expect(company.note).toMatch(/missing/i)

    const phone = exp.quality.factors.find((f) => f.key === "phone")!
    expect(phone.note).toMatch(/valid mobile/i)
  })

  it("identifies intent as the limiting factor when it is lowest", () => {
    const exp = buildScoreExplanation({
      grade: "B", fit_score: 72, intent_score: 18, quality_score: 65,
      fit_score_breakdown: {}, quality_score_breakdown: {},
    })
    expect(exp.limiting).toBe("intent")
    expect(exp.summary).toMatch(/intent is the limiting factor/i)
    expect(exp.intent.note).toMatch(/no recent engagement/i)
  })

  it("identifies quality as limiting when data is the weakest", () => {
    const exp = buildScoreExplanation({
      grade: "C", fit_score: 70, intent_score: 55, quality_score: 20,
      fit_score_breakdown: {}, quality_score_breakdown: {},
    })
    expect(exp.limiting).toBe("quality")
    expect(exp.summary).toMatch(/data quality is the limiting factor/i)
  })

  it("surfaces the junk penalty only when it applies", () => {
    const withJunk = buildScoreExplanation({
      grade: "D", fit_score: 30, intent_score: 20, quality_score: 10,
      fit_score_breakdown: {}, quality_score_breakdown: { phone: 30, email: 0, company: 0, inquiry: 0, source: 0, junk: -10 },
    })
    expect(withJunk.quality.factors.some((f) => f.key === "junk")).toBe(true)

    const noJunk = buildScoreExplanation({
      grade: "D", fit_score: 30, intent_score: 20, quality_score: 10,
      fit_score_breakdown: {}, quality_score_breakdown: { phone: 30, junk: 0 },
    })
    expect(noJunk.quality.factors.some((f) => f.key === "junk")).toBe(false)
  })

  it("flags when no stored breakdown is available (older lead)", () => {
    const exp = buildScoreExplanation({
      grade: "C", fit_score: 50, intent_score: 40, quality_score: 45,
      fit_score_breakdown: null, quality_score_breakdown: undefined,
    })
    expect(exp.breakdownMissing).toBe(true)
    expect(exp.fit.factors).toHaveLength(0)
    expect(exp.quality.factors).toHaveLength(0)
    // Top-line scores + summary still work without a breakdown.
    expect(exp.summary).toMatch(/graded c/i)
  })
})
