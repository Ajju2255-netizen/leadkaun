import { describe, it, expect } from "vitest"
import {
  computeExecutionScore,
  expectedProgress,
  scoreBand,
  EXEC_SCORE_WEIGHTS,
} from "../execution-score"
import type { ExecScoreInputs } from "../execution-score"

const baseInputs: ExecScoreInputs = {
  fu_due_today:        0,
  fu_completed_today:  0,
  fu_overdue_now:      0,
  leads_touched_today: 0,
  ab_leads_today:      0,
  ab_leads_contacted:  0,
  signals_today:       0,
  hour_ist:            15,
}

describe("expectedProgress", () => {
  it("is 0 before the workday", () => {
    expect(expectedProgress(8)).toBe(0)
    expect(expectedProgress(9.4)).toBe(0)
  })
  it("ramps through the day with mild back-loading", () => {
    expect(expectedProgress(15)).toBeGreaterThan(0.6)
    expect(expectedProgress(15)).toBeLessThan(0.75)
    expect(expectedProgress(16)).toBeGreaterThan(0.75)
  })
  it("is 1 after 7pm", () => {
    expect(expectedProgress(19)).toBe(1)
    expect(expectedProgress(22)).toBe(1)
  })
})

describe("computeExecutionScore", () => {
  it("triggers the <25 alert threshold for a falling-behind rep at 3pm", () => {
    // Rep has FUs due, A/B leads to contact, and is accumulating overdues —
    // this is the profile the 3pm IST manager alert is designed to surface.
    const { score } = computeExecutionScore({
      ...baseInputs,
      hour_ist: 15,
      fu_due_today: 8,
      fu_completed_today: 0,
      fu_overdue_now: 3,
      leads_touched_today: 0,
      ab_leads_today: 3,
      ab_leads_contacted: 0,
      signals_today: 0,
    })
    expect(score).toBeLessThan(25)
  })

  it("does NOT alert reps who simply have nothing assigned today", () => {
    // No FUs, no A/B leads, no overdues — score should remain in safe range
    // so we don't spam the manager about a rep doing nothing because there's
    // nothing to do.
    const { score } = computeExecutionScore({ ...baseInputs, hour_ist: 15 })
    expect(score).toBeGreaterThanOrEqual(25)
  })

  it("approaches 100 for a rep on full pace at end-of-day", () => {
    const { score } = computeExecutionScore({
      fu_due_today: 8,
      fu_completed_today: 8,
      fu_overdue_now: 0,
      leads_touched_today: 10,
      ab_leads_today: 4,
      ab_leads_contacted: 4,
      signals_today: 14,
      hour_ist: 19,
    })
    expect(score).toBeGreaterThanOrEqual(95)
  })

  it("subtracts roughly the full overdue weight when 5 are overdue", () => {
    const noOverdue = computeExecutionScore({
      ...baseInputs,
      hour_ist: 15,
      fu_due_today: 4,
      fu_completed_today: 4,
      leads_touched_today: 6,
      signals_today: 9,
      fu_overdue_now: 0,
    })
    const fiveOverdue = computeExecutionScore({
      ...baseInputs,
      hour_ist: 15,
      fu_due_today: 4,
      fu_completed_today: 4,
      leads_touched_today: 6,
      signals_today: 9,
      fu_overdue_now: 5,
    })
    expect(noOverdue.score - fiveOverdue.score).toBeGreaterThanOrEqual(
      EXEC_SCORE_WEIGHTS.overdue_penalty - 1,
    )
  })

  it("returns full speed credit when there are no A/B leads today", () => {
    const { components } = computeExecutionScore({
      ...baseInputs,
      hour_ist: 15,
      ab_leads_today: 0,
      ab_leads_contacted: 0,
    })
    expect(components.speed_to_lead_today).toBe(EXEC_SCORE_WEIGHTS.speed_to_lead_today)
  })

  it("clamps to [0, 100]", () => {
    const { score } = computeExecutionScore({
      ...baseInputs,
      hour_ist: 19,
      fu_due_today: 100,
      fu_completed_today: 100,
      leads_touched_today: 1000,
      signals_today: 9999,
      ab_leads_today: 10,
      ab_leads_contacted: 10,
    })
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it("weights sum to 100", () => {
    const sum = Object.values(EXEC_SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })
})

describe("scoreBand", () => {
  it("classifies values into 5 buckets", () => {
    expect(scoreBand(10)).toBe("critical")
    expect(scoreBand(30)).toBe("low")
    expect(scoreBand(60)).toBe("ok")
    expect(scoreBand(75)).toBe("good")
    expect(scoreBand(95)).toBe("great")
  })
})
