/**
 * Compliance / SLA model for the Activity module.
 *
 * Response-time SLA windows per grade mirror the grade-based thresholds already
 * used to flag missed opportunities (see app/api/analytics/missed/route.ts):
 * the hotter the lead, the tighter the window to make first contact.
 */

import type { LeadGrade } from "@prisma/client"

/** Hours allowed to make first contact, by grade. null = no SLA (E/F leads). */
export const GRADE_SLA_HOURS: Record<LeadGrade, number | null> = {
  A: 24,
  B: 48,
  C: 168,   // 7 days
  D: 720,   // 30 days
  E: null,
  F: null,
}

/** Was first contact made within the lead's grade SLA? null grade SLA ⇒ always compliant. */
export function isWithinSla(grade: LeadGrade, speedToLeadHours: number | null | undefined): boolean {
  const sla = GRADE_SLA_HOURS[grade]
  if (sla == null) return true
  if (speedToLeadHours == null) return false // never contacted ⇒ breached
  return speedToLeadHours <= sla
}

export type ComplianceBand = "compliant" | "at_risk" | "breached"

/** Map a 0–100 compliance percentage to a band. */
export function complianceBand(pct: number): ComplianceBand {
  if (pct >= 85) return "compliant"
  if (pct >= 60) return "at_risk"
  return "breached"
}

export const COMPLIANCE_BAND_STYLE: Record<ComplianceBand, { label: string; text: string; bg: string; ring: string }> = {
  compliant: { label: "On track",  text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  at_risk:   { label: "At risk",   text: "text-amber-700",   bg: "bg-amber-50",   ring: "ring-amber-200"   },
  breached:  { label: "Breached",  text: "text-rose-700",    bg: "bg-rose-50",    ring: "ring-rose-200"    },
}
