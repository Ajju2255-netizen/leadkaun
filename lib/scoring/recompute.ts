// Reusable fit/quality/grade recompute — mirrors the canonical regrade pipeline
// (app/api/admin/regrade). Used when an enrichment edit changes scoring-relevant
// fields: intent is left unchanged (editing data doesn't change engagement), so
// we only recompute fit + quality and re-assign the grade.

import type { LeadGrade } from "@prisma/client"
import { computeFitScore } from "./fit-score"
import { computeQualityScore } from "./quality-score"
import { assignGrade } from "./grade"
import { getNotesGradeOverride } from "./notes-intent"
import { mapCityToState, inferIndustry } from "@/lib/import/enrich-lead"

export type RescoreIcp = {
  icp_configured: boolean
  icp_industries: string[]
  icp_states: string[]
  icp_business_types: string[]
  icp_roles: string[]
  icp_budget_min: number | null
  icp_budget_max: number | null
}

export type RescoreLead = {
  company_name: string | null
  designation: string | null
  city: string | null
  state: string | null
  expected_value: number | null
  phone: string
  email: string | null
  inquiry_text: string | null
  junk_flags: string[]
  is_junk: boolean
}

export type RescoreResult = {
  fit_score: number
  quality_score: number
  grade: LeadGrade
  fit_breakdown: unknown
  quality_breakdown: unknown
}

export function recomputeFitQualityGrade(args: {
  lead: RescoreLead
  icp: RescoreIcp
  sourceReliability: number
  intentScore: number
  hasActivity: boolean
}): RescoreResult {
  const fit = computeFitScore({
    lead: {
      industry:       inferIndustry(args.lead.company_name) ?? undefined,
      state:          args.lead.state ?? mapCityToState(args.lead.city) ?? undefined,
      city:           args.lead.city ?? undefined,
      company_name:   args.lead.company_name ?? undefined,
      designation:    args.lead.designation ?? undefined,
      expected_value: args.lead.expected_value ?? undefined,
    },
    icp: args.icp,
  })

  const quality = computeQualityScore({
    phone:              args.lead.phone,
    email:              args.lead.email,
    company_name:       args.lead.company_name,
    inquiry_text:       args.lead.inquiry_text,
    source_reliability: args.sourceReliability,
    junk_flags:         args.lead.junk_flags,
    is_junk:            args.lead.is_junk,
  })

  const computedGrade = assignGrade(fit.total, args.intentScore, quality.total, !args.hasActivity)
  const override = getNotesGradeOverride(args.lead.inquiry_text)
  const grade = (override?.grade ?? computedGrade) as LeadGrade

  return {
    fit_score: fit.total,
    quality_score: quality.total,
    grade,
    fit_breakdown: fit.breakdown,
    quality_breakdown: quality.breakdown,
  }
}
