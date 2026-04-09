import { describe, it, expect } from "vitest"
import { computeFitScore } from "../fit-score"
import { computeIntentScore, daysBetween } from "../intent-score"
import { computeQualityScore } from "../quality-score"
import { assignGrade, checkSqlThreshold } from "../grade"
import { computeNextBestAction } from "../nba"
import type { SignalRecord } from "../types"

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function signal(
  type: SignalRecord["signal_type"],
  value: number,
  daysOld = 0,
): SignalRecord {
  return { signal_type: type, signal_value: value, created_at: daysAgo(daysOld) }
}

const BASE_ICP = {
  icp_configured: true,
  icp_industries: ["real estate"],
  icp_states: ["Maharashtra"],
  icp_business_types: ["builders"],
  icp_roles: ["owner", "manager"],
  icp_budget_min: 100000,
  icp_budget_max: 1000000,
}

// ─────────────────────────────────────────────
// FIT SCORE
// ─────────────────────────────────────────────

describe("computeFitScore", () => {
  it("returns benchmark defaults when ICP not configured", () => {
    const result = computeFitScore({
      lead: { industry: "anything", state: "Kerala" },
      icp: { icp_configured: false, icp_industries: [], icp_states: [], icp_business_types: [], icp_roles: [] },
    })
    expect(result.total).toBeGreaterThan(30)
    expect(result.total).toBeLessThan(70)
  })

  it("scores maximum when lead perfectly matches ICP", () => {
    const result = computeFitScore({
      lead: {
        industry: "real estate",
        state: "Maharashtra",
        company_name: "ABC builders pvt ltd",
        designation: "owner",
        expected_value: 500000,
      },
      icp: BASE_ICP,
    })
    expect(result.total).toBe(100)
    expect(result.breakdown.industry).toBe(30)
    expect(result.breakdown.geography).toBe(20)
    expect(result.breakdown.role).toBe(15)
    expect(result.breakdown.budget).toBe(15)
  })

  it("scores zero for complete ICP mismatch", () => {
    const result = computeFitScore({
      lead: { industry: "automotive", state: "Kerala" },
      icp: BASE_ICP,
    })
    expect(result.breakdown.industry).toBe(0)
    expect(result.breakdown.geography).toBe(0)
  })

  it("gives partial credit for company present but type mismatch", () => {
    const result = computeFitScore({
      lead: { company_name: "XYZ Corp", state: "Maharashtra" },
      icp: { ...BASE_ICP, icp_business_types: ["builders"] },
    })
    expect(result.breakdown.business_type).toBe(5)
  })

  it("budget within 30% of range gets partial credit", () => {
    const result = computeFitScore({
      lead: { expected_value: 1200000 },  // 20% above max
      icp: { ...BASE_ICP, icp_industries: [], icp_states: [], icp_business_types: [], icp_roles: [] },
    })
    expect(result.breakdown.budget).toBe(8)
  })

  it("caps total at 100", () => {
    const result = computeFitScore({
      lead: {
        industry: "real estate",
        state: "Maharashtra",
        company_name: "ABC builders",
        designation: "owner",
        expected_value: 500000,
      },
      icp: BASE_ICP,
    })
    expect(result.total).toBeLessThanOrEqual(100)
  })
})

// ─────────────────────────────────────────────
// INTENT SCORE
// ─────────────────────────────────────────────

describe("computeIntentScore", () => {
  it("returns source_baseline when no signals and no decay", () => {
    const score = computeIntentScore({
      signals: [],
      source_baseline: 30,
      sales_cycle: "FOUR_WEEKS",
      imported_at: daysAgo(1),
    })
    expect(score).toBe(30)
  })

  it("adds positive signals above baseline — SOURCE_BASELINE signal included at import", () => {
    // SOURCE_BASELINE signal (value=30) is written at import time
    const score = computeIntentScore({
      signals: [
        signal("SOURCE_BASELINE", 30, 3),          // written at import
        signal("CALL_ANSWERED_INTERESTED", 20, 0),  // logged today
      ],
      source_baseline: 30,
      sales_cycle: "FOUR_WEEKS",
      imported_at: daysAgo(3),
    })
    expect(score).toBe(50)  // 30 + 20 = 50
  })

  it("never drops below source_baseline due to decay", () => {
    const score = computeIntentScore({
      signals: [signal("CALL_NOT_ANSWERED", -3, 60)],
      source_baseline: 30,
      sales_cycle: "FOUR_WEEKS",
      imported_at: daysAgo(90),
    })
    expect(score).toBeGreaterThanOrEqual(30)
  })

  it("caps score at 100", () => {
    const bigSignals = Array.from({ length: 6 }, () =>
      signal("WA_TAG_NEGOTIATING", 25, 1),
    )
    const score = computeIntentScore({
      signals: bigSignals,
      source_baseline: 10,
      sales_cycle: "SAME_DAY",
      imported_at: daysAgo(2),
    })
    expect(score).toBe(100)
  })

  it("applies decay after FOUR_WEEKS threshold", () => {
    const score = computeIntentScore({
      signals: [signal("CALL_ANSWERED_INTERESTED", 20, 60)],  // last positive 60 days ago
      source_baseline: 10,
      sales_cycle: "FOUR_WEEKS",  // threshold = 28 days
      imported_at: daysAgo(60),
    })
    // decay days = 60 - 28 = 32, penalty = 32 * 3 = 96
    // raw = 20, raw - 96 = -76, floored at baseline = 10
    expect(score).toBe(10)
  })

  it("no decay within threshold window", () => {
    const score = computeIntentScore({
      signals: [
        signal("SOURCE_BASELINE", 10, 10),          // baseline at import
        signal("CALL_ANSWERED_INTERESTED", 20, 10),  // same day as import
      ],
      source_baseline: 10,
      sales_cycle: "FOUR_WEEKS",  // threshold = 28 days, 10 days elapsed — no decay
      imported_at: daysAgo(10),
    })
    expect(score).toBe(30)  // 10 + 20 = 30, no decay
  })

  it("OVER_THREE_MONTHS cycle has 120-day threshold", () => {
    const score = computeIntentScore({
      signals: [
        signal("SOURCE_BASELINE", 10, 100),
        signal("CALL_ANSWERED_INTERESTED", 20, 100),  // 100 days ago
      ],
      source_baseline: 10,
      sales_cycle: "OVER_THREE_MONTHS",  // threshold = 120 days, within window
      imported_at: daysAgo(100),
    })
    expect(score).toBe(30)  // within threshold, no decay
  })
})

// ─────────────────────────────────────────────
// QUALITY SCORE
// ─────────────────────────────────────────────

describe("computeQualityScore", () => {
  it("awards 30 for a valid Indian mobile number", () => {
    const result = computeQualityScore({
      phone: "+919876543210",
      email: null,
      company_name: null,
      inquiry_text: null,
      source_reliability: 0,
      junk_flags: [],
      is_junk: false,
    })
    expect(result.breakdown.phone).toBe(30)
  })

  it("awards 15 for a landline number", () => {
    const result = computeQualityScore({
      phone: "+912233445566",
      email: null,
      company_name: null,
      inquiry_text: null,
      source_reliability: 0,
      junk_flags: [],
      is_junk: false,
    })
    expect(result.breakdown.phone).toBe(15)
  })

  it("awards 0 for invalid phone", () => {
    const result = computeQualityScore({
      phone: "+911234",  // too short
      email: null,
      company_name: null,
      inquiry_text: null,
      source_reliability: 0,
      junk_flags: [],
      is_junk: false,
    })
    expect(result.breakdown.phone).toBe(0)
  })

  it("awards 15 for email, 15 for company", () => {
    const result = computeQualityScore({
      phone: "+911111111111",
      email: "test@test.com",
      company_name: "Test Corp",
      inquiry_text: null,
      source_reliability: 0,
      junk_flags: [],
      is_junk: false,
    })
    expect(result.breakdown.email).toBe(15)
    expect(result.breakdown.company).toBe(15)
  })

  it("high specificity inquiry scores 20", () => {
    const result = computeQualityScore({
      phone: "+911111111111",
      email: null,
      company_name: null,
      inquiry_text: "I need 500 units of product with specification X and my budget is 2 lakhs",
      source_reliability: 0,
      junk_flags: [],
      is_junk: false,
    })
    expect(result.breakdown.inquiry).toBe(20)
  })

  it("applies -10 junk penalty", () => {
    const result = computeQualityScore({
      phone: "+919876543210",
      email: "a@b.com",
      company_name: "Corp",
      inquiry_text: "interested",
      source_reliability: 100,
      junk_flags: ["duplicate_phone"],
      is_junk: true,
    })
    expect(result.breakdown.junk).toBe(-10)
  })

  it("total never goes below 0", () => {
    const result = computeQualityScore({
      phone: "+911234",    // invalid = 0
      email: null,
      company_name: null,
      inquiry_text: null,
      source_reliability: 0,
      junk_flags: ["test"],
      is_junk: true,
    })
    expect(result.total).toBe(0)
  })

  it("total never exceeds 100", () => {
    const result = computeQualityScore({
      phone: "+919876543210",
      email: "a@b.com",
      company_name: "Corp",
      inquiry_text: "I want 500 units with spec X and budget of 5 lakhs please quote",
      source_reliability: 100,
      junk_flags: [],
      is_junk: false,
    })
    expect(result.total).toBeLessThanOrEqual(100)
  })
})

// ─────────────────────────────────────────────
// GRADE
// ─────────────────────────────────────────────

describe("assignGrade", () => {
  it("F when quality < 20", () => {
    expect(assignGrade(80, 80, 19)).toBe("F")
    expect(assignGrade(0, 0, 0)).toBe("F")
  })

  it("A for fit ≥ 65, intent ≥ 60, quality ≥ 60", () => {
    expect(assignGrade(65, 60, 60)).toBe("A")
    expect(assignGrade(100, 100, 100)).toBe("A")
  })

  it("B for fit ≥ 55, intent ≥ 40, quality ≥ 50 (not A)", () => {
    expect(assignGrade(55, 40, 50)).toBe("B")
    expect(assignGrade(60, 45, 55)).toBe("B")
  })

  it("C for fit ≥ 40, intent ≥ 55, quality ≥ 40 (not A or B)", () => {
    expect(assignGrade(40, 55, 40)).toBe("C")
  })

  it("D for fit ≥ 35, intent ≥ 25, quality ≥ 30 (not A, B, or C)", () => {
    expect(assignGrade(35, 25, 30)).toBe("D")
  })

  it("E for everything below D thresholds", () => {
    expect(assignGrade(20, 20, 25)).toBe("E")
  })

  it("A takes priority over B when all thresholds met", () => {
    // This scores A (fit 70, intent 65, quality 65)
    expect(assignGrade(70, 65, 65)).toBe("A")
  })

  it("grade boundary — just below A becomes B", () => {
    expect(assignGrade(64, 60, 60)).toBe("B")  // fit just below A threshold
  })
})

describe("checkSqlThreshold", () => {
  it("returns true when both thresholds met", () => {
    expect(checkSqlThreshold(60, 50, 55, 45)).toBe(true)
  })

  it("returns false when fit below threshold", () => {
    expect(checkSqlThreshold(50, 50, 55, 45)).toBe(false)
  })

  it("returns false when intent below threshold", () => {
    expect(checkSqlThreshold(60, 40, 55, 45)).toBe(false)
  })

  it("returns false when both below threshold", () => {
    expect(checkSqlThreshold(40, 30, 55, 45)).toBe(false)
  })
})

// ─────────────────────────────────────────────
// NBA
// ─────────────────────────────────────────────

describe("computeNextBestAction", () => {
  it("returns urgent call for uncontacted A-grade lead", () => {
    const nba = computeNextBestAction("A", [], false)
    expect(nba.priority).toBe("urgent")
    expect(nba.action).toMatch(/call/i)
  })

  it("closing call when negotiating", () => {
    const nba = computeNextBestAction("A", [signal("WA_TAG_NEGOTIATING", 25, 0)], true)
    expect(nba.action).toMatch(/clos/i)
    expect(nba.priority).toBe("urgent")
  })

  it("callback action when callback was requested", () => {
    const nba = computeNextBestAction("B", [signal("CALL_ANSWERED_CALLBACK", 10, 0)], true)
    expect(nba.action).toMatch(/callback|call back/i)
    expect(nba.priority).toBe("urgent")
  })

  it("verifies contact details after wrong number", () => {
    const nba = computeNextBestAction("E", [signal("CALL_ANSWERED_WRONG_NUMBER", -30, 0)], true)
    expect(nba.action).toMatch(/verify/i)
  })

  it("suggests switching to WhatsApp after 3 unanswered calls", () => {
    const manyMissed = [
      signal("CALL_NOT_ANSWERED", -3, 1),
      signal("CALL_NOT_ANSWERED", -3, 2),
      signal("CALL_NOT_ANSWERED", -3, 3),
    ]
    const nba = computeNextBestAction("B", manyMissed, true)
    expect(nba.action).toMatch(/whatsapp/i)
  })

  it("re-engage signal for intent decay", () => {
    const nba = computeNextBestAction("C", [signal("INTENT_DECAY", -3, 0)], true)
    expect(nba.action).toMatch(/re-engage|re engage/i)
  })
})

// ─────────────────────────────────────────────
// daysBetween utility
// ─────────────────────────────────────────────

describe("daysBetween", () => {
  it("returns 0 for same day", () => {
    const now = new Date()
    expect(daysBetween(now, now)).toBe(0)
  })

  it("returns correct days", () => {
    expect(daysBetween(daysAgo(10), new Date())).toBe(10)
  })

  it("never returns negative", () => {
    const future = new Date(Date.now() + 86400000)
    expect(daysBetween(future, new Date())).toBe(0)
  })
})
