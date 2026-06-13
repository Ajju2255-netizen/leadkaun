import type { FitScoreInput, FitScoreResult, FitScoreBreakdown } from "./types"

// Baseline fit scores when ICP is not configured at all.
// Kept low (~30 total) so leads default to D — the system literally has no
// criteria to evaluate fit, so we cannot reward high scores.
// Configuring ICP is what unlocks B/A territory.
const ICP_NOT_CONFIGURED_DEFAULTS: FitScoreBreakdown = {
  industry:      10,
  geography:     8,
  business_type: 8,
  role:          6,
  budget:        6,
}

/**
 * Computes the Fit Score (0–100) by comparing the lead's profile against
 * the account's ICP configuration.
 *
 * Scoring philosophy:
 *   MATCH    → full points  (the lead proves it fits)
 *   MISMATCH → 0 points     (no penalty — just no reward)
 *   UNKNOWN  → small credit  (dimension configured in ICP but lead has no data)
 *   NOT SET  → tiny baseline (dimension not part of this account's ICP)
 *
 * This prevents "everything is A" when ICP dimensions aren't configured
 * while still rewarding leads that clearly match the configured criteria.
 *
 * Components:
 *   industry      0–30
 *   geography     0–20
 *   business_type 0–20
 *   role          0–15
 *   budget        0–15
 *
 * TAD ref: Section 4.2
 */
export function computeFitScore(input: FitScoreInput): FitScoreResult {
  const { lead, icp } = input

  if (!icp.icp_configured) {
    const breakdown = ICP_NOT_CONFIGURED_DEFAULTS
    return {
      total: clamp(sum(breakdown), 0, 100),
      breakdown,
    }
  }

  const breakdown: FitScoreBreakdown = {
    industry:      scoreIndustry(lead.industry, icp.icp_industries),
    geography:     scoreGeography(lead.state, lead.city, icp.icp_states),
    business_type: scoreBusinessType(lead.company_name, icp.icp_business_types),
    role:          scoreRole(lead.designation, icp.icp_roles),
    budget:        scoreBudget(lead.expected_value, icp.icp_budget_min, icp.icp_budget_max),
  }

  return {
    total: clamp(sum(breakdown), 0, 100),
    breakdown,
  }
}

// ─────────────────────────────────────────────
// Component scorers
// ─────────────────────────────────────────────

function scoreIndustry(
  leadIndustry: string | null | undefined,
  icpIndustries: string[],
): number {
  if (!icpIndustries.length) return 6   // dimension not in ICP → small baseline
  if (!leadIndustry) return 3           // ICP set, but lead has no industry data
  const lead = leadIndustry.toLowerCase().trim()
  const match = icpIndustries.some((i) => i.toLowerCase().trim() === lead)
  return match ? 30 : 0                 // mismatch = no reward, no penalty
}

function scoreGeography(
  leadState: string | null | undefined,
  _leadCity: string | null | undefined,
  icpStates: string[],
): number {
  if (!icpStates.length) return 5       // dimension not in ICP → small baseline
  if (!leadState) return 3              // ICP set, but lead has no state data
  const lead = leadState.toLowerCase().trim()
  const match = icpStates.some((s) => s.toLowerCase().trim() === lead)
  return match ? 20 : 0                 // mismatch = 0
}

function scoreBusinessType(
  companyName: string | null | undefined,
  icpBusinessTypes: string[],
): number {
  if (!icpBusinessTypes.length) return 5  // dimension not in ICP → small baseline
  if (!companyName) return 3              // ICP set, but no company data
  const name = companyName.toLowerCase()
  const match = icpBusinessTypes.some((bt) => name.includes(bt.toLowerCase().trim()))
  // Match → full; mismatch but company present → 5 (knowing the business name
  // is still more signal than not knowing it at all).
  return match ? 20 : 5
}

function scoreRole(
  designation: string | null | undefined,
  icpRoles: string[],
): number {
  if (!icpRoles.length) return 4        // dimension not in ICP → small baseline
  if (!designation) return 2            // ICP set, but lead has no designation
  const desig = designation.toLowerCase()
  const match = icpRoles.some((r) => desig.includes(r.toLowerCase().trim()))
  return match ? 15 : 0
}

function scoreBudget(
  expectedValue: number | null | undefined,
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
): number {
  if (budgetMin == null && budgetMax == null) return 5  // dimension not in ICP
  if (expectedValue == null || expectedValue <= 0) return 2  // ICP set, no lead data

  const min = budgetMin ?? 0
  const max = budgetMax ?? Infinity

  if (expectedValue >= min && expectedValue <= max) return 15      // perfect range
  if (expectedValue >= min * 0.7 && expectedValue <= max * 1.3) return 8  // within 30%
  return 0
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function sum(b: FitScoreBreakdown): number {
  return b.industry + b.geography + b.business_type + b.role + b.budget
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)))
}
