import { describe, it, expect } from "vitest"
import { calibration, median, closeTimeByGrade, winBySegment, bestHour } from "../learning"

describe("calibration", () => {
  it("computes lift and directional accuracy", () => {
    const rows = [
      ...Array(8).fill({ grade: "A", won: true }),
      ...Array(2).fill({ grade: "A", won: false }),  // A: 80% win
      ...Array(1).fill({ grade: "D", won: true }),
      ...Array(4).fill({ grade: "D", won: false }),  // D: 20% win
    ]
    const c = calibration(rows)
    expect(c.abWinRate).toBeCloseTo(0.8)
    expect(c.deWinRate).toBeCloseTo(0.2)
    expect(c.lift).toBe(4)  // 0.8 / 0.2
    // accuracy: A won (8) + D lost (4) = 12 of 15 → 80%
    expect(c.accuracy).toBe(80)
    expect(c.decided).toBe(15)
  })

  it("excludes grade C from accuracy (neither high nor low)", () => {
    const c = calibration([{ grade: "C", won: true }, { grade: "C", won: false }])
    expect(c.accuracy).toBeNull()  // no A/B or D/E/F
    expect(c.perGrade.find((p) => p.grade === "C")?.winRate).toBe(50)
  })
})

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe("closeTimeByGrade", () => {
  it("only returns grades meeting the minimum sample", () => {
    const rows = [
      { grade: "A", days: 10 }, { grade: "A", days: 20 }, { grade: "A", days: 30 },
      { grade: "B", days: 50 }, // only 1 — below min 3
    ]
    const r = closeTimeByGrade(rows, 3)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ grade: "A", medianDays: 20, n: 3 })
  })
})

describe("winBySegment", () => {
  it("ranks segments by win rate, gated by decided count", () => {
    const rows = [
      ...Array(7).fill({ segment: "Manufacturing", won: true }),
      ...Array(1).fill({ segment: "Manufacturing", won: false }), // 8 decided, 88%
      ...Array(2).fill({ segment: "Retail", won: false }),         // 2 decided — below gate
    ]
    const r = winBySegment(rows, 8)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ segment: "Manufacturing", winRate: 88, decided: 8 })
  })
})

describe("bestHour", () => {
  it("finds the modal hour", () => {
    const r = bestHour([11.2, 11.9, 12.1, 15.0, 11.5])!
    expect(r.hour).toBe(11)
    expect(r.count).toBe(3)
    expect(r.total).toBe(5)
  })
  it("returns null with no data", () => {
    expect(bestHour([])).toBeNull()
  })
})
