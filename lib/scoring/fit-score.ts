import type { FitScoreInput, FitScoreResult, FitScoreBreakdown } from "./types"

// Default scores used when ICP is not configured.
// Based on industry median conversion benchmarks (TAD 4.2.1).
const ICP_NOT_CONFIGURED_DEFAULTS: FitScoreBreakdown = {
  industry:      15,  // mid-range until account tells us what they care about
  geography:     10,
  business_type: 10,
  role:           8,
  budget:         7,
}

/**
 * Computes the Fit Score (0–100) by comparing the lead's profile against
 * the account's ICP configuration.
 *
 * Components:
 *   industry      0–30
 *   geography     0–20
 *   business_type 0–20
 *   role          0–15
 *   budget        0–15
 *
 * When ICP is not configured, returns benchmark defaults (total ≈ 50).
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
  icpIndustries: string[]
): number {
  if (!icpIndustries.length) return 20  // no ICP set → partial credit
  if (!leadIndustry) return 10          // ICP set but lead has no industry → unknown, not zero
  const lead = leadIndustry.toLowerCase().trim()
  const match = icpIndustries.some((i) => i.toLowerCase().trim() === lead)
  return match ? 30 : 5               // 5 = present but doesn't match ICP
}

function scoreGeography(
  leadState: string | null | undefined,
  _leadCity: string | null | undefined,
  icpStates: string[]
): number {
  if (!icpStates.length) return 12    // no geo ICP → partial credit
  if (!leadState) return 8            // ICP set but lead has no state → unknown, not zero
  const lead = leadState.toLowerCase().trim()
  const match = icpStates.some((s) => s.toLowerCase().trim() === lead)
  return match ? 20 : 4              // 4 = present but out of target geo
}

function scoreBusinessType(
  companyName: string | null | undefined,
  icpBusinessTypes: string[]
): number {
  if (!icpBusinessTypes.length) return 12  // no business type ICP → partial credit
  if (!companyName) return 8               // ICP set but no company data → unknown, not zero
  // Fuzzy keyword match against company name (simple heuristic)
  const name = companyName.toLowerCase()
  const match = icpBusinessTypes.some((bt) => name.includes(bt.toLowerCase().trim()))
  return match ? 20 : 5  // partial credit if company present but type doesn't match
}

function scoreRole(
  designation: string | null | undefined,
  icpRoles: string[]
): number {
  if (!icpRoles.length) return 8      // no role ICP → partial credit
  if (!designation) return 5          // ICP set but lead has no designation → unknown, not zero
  const desig = designation.toLowerCase()
  const match = icpRoles.some((r) => desig.includes(r.toLowerCase().trim()))
  return match ? 15 : 3              // 3 = present but role doesn't match ICP
}

function scoreBudget(
  expectedValue: number | null | undefined,
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
): number {
  if (budgetMin == null && budgetMax == null) return 8  // no budget ICP → partial credit
  if (expectedValue == null || expectedValue <= 0) return 5  // budget ICP set but no lead data → unknown

  const min = budgetMin ?? 0
  const max = budgetMax ?? Infinity

  if (expectedValue >= min && expectedValue <= max) return 15  // perfect fit
  if (expectedValue >= min * 0.7 && expectedValue <= max * 1.3) return 8  // within 30% of range
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
