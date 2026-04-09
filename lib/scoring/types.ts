import type { LeadGrade, SignalType, SalesCycle } from "@prisma/client"

// ─────────────────────────────────────────────
// FIT SCORE
// ─────────────────────────────────────────────

export type FitScoreInput = {
  // Lead fields
  lead: {
    industry?: string | null
    state?: string | null
    city?: string | null
    company_name?: string | null
    designation?: string | null
    expected_value?: number | null
  }
  // Account ICP configuration
  icp: {
    icp_configured: boolean
    icp_industries: string[]
    icp_states: string[]
    icp_business_types: string[]
    icp_roles: string[]
    icp_budget_min?: number | null
    icp_budget_max?: number | null
  }
}

export type FitScoreBreakdown = {
  industry:      number   // 0–30
  geography:     number   // 0–20
  business_type: number   // 0–20
  role:          number   // 0–15
  budget:        number   // 0–15
}

export type FitScoreResult = {
  total:     number   // 0–100
  breakdown: FitScoreBreakdown
}

// ─────────────────────────────────────────────
// INTENT SCORE
// ─────────────────────────────────────────────

export type SignalRecord = {
  signal_type:  SignalType
  signal_value: number
  created_at:   Date
}

export type IntentScoreInput = {
  signals:         SignalRecord[]
  source_baseline: number      // from LeadSource.intent_baseline
  sales_cycle:     SalesCycle  // from Account.icp_sales_cycle
  imported_at:     Date
}

// ─────────────────────────────────────────────
// QUALITY SCORE
// ─────────────────────────────────────────────

export type QualityScoreInput = {
  phone:            string
  email?:           string | null
  company_name?:    string | null
  inquiry_text?:    string | null
  source_reliability: number    // LeadSource.reliability_score (0–100)
  junk_flags:       string[]
  is_junk:          boolean
}

export type QualityScoreBreakdown = {
  phone:     number   // 0–30
  email:     number   // 0–15
  company:   number   // 0–15
  inquiry:   number   // 0–20
  source:    number   // 0–10
  junk:      number   // 0 or -10
}

export type QualityScoreResult = {
  total:     number   // 0–100 (floored at 0)
  breakdown: QualityScoreBreakdown
}

// ─────────────────────────────────────────────
// COMBINED SCORING RESULT
// ─────────────────────────────────────────────

export type ScoringResult = {
  fit_score:              number
  intent_score:           number
  quality_score:          number
  grade:                  LeadGrade
  is_sql:                 boolean
  fit_score_breakdown:    FitScoreBreakdown
  quality_score_breakdown: QualityScoreBreakdown
}

// ─────────────────────────────────────────────
// NBA (Next Best Action)
// ─────────────────────────────────────────────

export type NextBestAction = {
  action: string   // Short action label (≤ 40 chars), shown on queue card
  reason: string   // Explanation for the rep (≤ 80 chars)
  priority: "urgent" | "high" | "normal"
}
