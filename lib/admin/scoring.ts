// ─────────────────────────────────────────────
// SCORING MONITOR (Mission Control)
//
// Is the engine grading sensibly, or is a whole cohort collapsing into one
// bucket? Grade distribution, the three component averages, and — the reason
// this screen exists — an explicit read on **unknown data vs bad data**.
//
// Law 1 is "Unknown ≠ Negative". The engine honours it (a mismatch scores 0,
// it does not subtract), but a lead with nothing known still lands near the
// bottom simply by having no points. That is legitimate scoring and a
// legitimate product problem, and the two look identical in a grade histogram.
// So we separate them: how many low-grade leads are low because we know they're
// a poor fit, vs low because we know almost nothing about them.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { ACTIVE_LEAD } from "@/lib/billing/lead-usage"
import type { LeadGrade, Prisma } from "@prisma/client"

export type ScoringFilters = {
  accountId?: string
  workspaceId?: string
  sourceKey?: string
  days?: number
  /** Exclude junk + closed leads. */
  openOnly?: boolean
}

export type GradeBucket = { grade: LeadGrade; count: number; pct: number }

export type ComponentBand = { label: string; fit: number; intent: number; quality: number }

export type ScoringMonitor = {
  total: number
  grades: GradeBucket[]
  averages: { fit: number | null; intent: number | null; quality: number | null }
  /** Distribution of each 0–100 component across five bands. */
  bands: ComponentBand[]
  /** The "unknown vs bad" split for everything at grade D/E/F. */
  lowGrade: {
    total: number
    thinData: number       // ≤1 of company/designation/city+state/email/value known
    knownMismatch: number   // enough is known; it genuinely doesn't fit
    junk: number
    thinPct: number | null
  }
  /** How complete the fit inputs are across the whole population. */
  fitInputs: { field: string; known: number; pct: number }[]
  icpCoverage: { accountsWithIcp: number; accountsTotal: number; leadsUnderIcp: number; leadsWithoutIcp: number }
  sqlCount: number
  /** Leads whose grade has never moved since creation. */
  neverRegraded: number
  regradedLast7d: number
  gradeChanges7d: { from: string; to: string; count: number }[]
  bySource: { source: string; count: number; avgFit: number; avgIntent: number; avgQuality: number; aPct: number }[]
}

const GRADES: LeadGrade[] = ["A", "B", "C", "D", "E", "F"]

function whereFrom(f: ScoringFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {}
  if (f.accountId) where.account_id = f.accountId
  if (f.workspaceId) where.workspace_id = f.workspaceId
  if (f.sourceKey) where.source = { key: f.sourceKey }
  if (f.days) where.imported_at = { gte: new Date(Date.now() - f.days * 86_400_000) }
  if (f.openOnly) Object.assign(where, ACTIVE_LEAD)
  return where
}

export async function getScoringMonitor(f: ScoringFilters = {}): Promise<ScoringMonitor> {
  const where = whereFrom(f)
  const d7 = new Date(Date.now() - 7 * 86_400_000)

  const bandCount = (field: "fit_score" | "intent_score" | "quality_score", gte: number, lt?: number) =>
    prisma.lead.count({ where: { ...where, [field]: lt == null ? { gte } : { gte, lt } } })

  const [
    total, byGrade, avgs, sqlCount,
    knownCompany, knownDesignation, knownLocation, knownEmail, knownValue, knownInquiry,
    accountsWithIcp, accountsTotal, leadsWithoutIcp,
    neverRegraded, regraded7d, lowGradeTotal, lowGradeJunk, lowGradeThin,
    bands, gradeChangeRows, sources, bySourceRaw,
  ] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ["grade"], where, _count: { _all: true } }),
    prisma.lead.aggregate({ where, _avg: { fit_score: true, intent_score: true, quality_score: true } }),
    prisma.lead.count({ where: { ...where, is_sql: true } }),

    prisma.lead.count({ where: { ...where, company_name: { not: null } } }),
    prisma.lead.count({ where: { ...where, designation: { not: null } } }),
    prisma.lead.count({ where: { ...where, OR: [{ state: { not: null } }, { city: { not: null } }] } }),
    prisma.lead.count({ where: { ...where, email: { not: null } } }),
    prisma.lead.count({ where: { ...where, expected_value: { not: null } } }),
    prisma.lead.count({ where: { ...where, inquiry_text: { not: null } } }),

    prisma.account.count({ where: { icp_configured: true } }),
    prisma.account.count(),
    prisma.lead.count({ where: { ...where, account: { icp_configured: false } } }),

    prisma.lead.count({ where: { ...where, grade_changed_at: null } }),
    prisma.lead.count({ where: { ...where, grade_changed_at: { gte: d7 } } }),

    prisma.lead.count({ where: { ...where, grade: { in: ["D", "E", "F"] } } }),
    prisma.lead.count({ where: { ...where, grade: { in: ["D", "E", "F"] }, is_junk: true } }),
    // "Thin": none of the enrichment fields that drive fit are known.
    prisma.lead.count({
      where: {
        ...where, grade: { in: ["D", "E", "F"] }, is_junk: false,
        company_name: null, designation: null, expected_value: null,
        AND: [{ state: null }, { city: null }],
      },
    }),

    Promise.all(
      [
        { label: "0–19", gte: 0, lt: 20 },
        { label: "20–39", gte: 20, lt: 40 },
        { label: "40–59", gte: 40, lt: 60 },
        { label: "60–79", gte: 60, lt: 80 },
        { label: "80–100", gte: 80, lt: undefined },
      ].map(async (b) => ({
        label: b.label,
        fit: await bandCount("fit_score", b.gte, b.lt),
        intent: await bandCount("intent_score", b.gte, b.lt),
        quality: await bandCount("quality_score", b.gte, b.lt),
      })),
    ),

    prisma.lead.groupBy({
      by: ["previous_grade", "grade"],
      where: { ...where, grade_changed_at: { gte: d7 }, previous_grade: { not: null } },
      _count: { _all: true },
    }),

    prisma.leadSource.findMany({ select: { id: true, name: true, key: true } }),
    prisma.lead.groupBy({
      by: ["source_id"], where,
      _count: { _all: true },
      _avg: { fit_score: true, intent_score: true, quality_score: true },
    }),
  ])

  const gradeTotal = byGrade.reduce((s, g) => s + g._count._all, 0)
  const round = (v: number | null) => (v == null ? null : Math.round(v))

  // Grade-A count per source needs its own pass (groupBy can't carry a filtered count).
  const aBySource = await prisma.lead.groupBy({
    by: ["source_id"], where: { ...where, grade: "A" }, _count: { _all: true },
  })
  const aMap = new Map(aBySource.map((r) => [r.source_id, r._count._all]))
  const sourceName = new Map(sources.map((s) => [s.id, s.name]))

  const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return {
    total,
    grades: GRADES.map((grade) => {
      const count = byGrade.find((g) => g.grade === grade)?._count._all ?? 0
      return { grade, count, pct: gradeTotal > 0 ? Math.round((count / gradeTotal) * 100) : 0 }
    }),
    averages: { fit: round(avgs._avg.fit_score), intent: round(avgs._avg.intent_score), quality: round(avgs._avg.quality_score) },
    bands,
    lowGrade: {
      total: lowGradeTotal,
      thinData: lowGradeThin,
      knownMismatch: Math.max(0, lowGradeTotal - lowGradeJunk - lowGradeThin),
      junk: lowGradeJunk,
      thinPct: lowGradeTotal > 0 ? Math.round((lowGradeThin / lowGradeTotal) * 100) : null,
    },
    fitInputs: [
      { field: "Company", known: knownCompany, pct: pctOf(knownCompany) },
      { field: "Role / designation", known: knownDesignation, pct: pctOf(knownDesignation) },
      { field: "Location", known: knownLocation, pct: pctOf(knownLocation) },
      { field: "Email", known: knownEmail, pct: pctOf(knownEmail) },
      { field: "Budget / value", known: knownValue, pct: pctOf(knownValue) },
      { field: "Inquiry text", known: knownInquiry, pct: pctOf(knownInquiry) },
    ].sort((a, b) => a.pct - b.pct),
    icpCoverage: {
      accountsWithIcp,
      accountsTotal,
      leadsUnderIcp: total - leadsWithoutIcp,
      leadsWithoutIcp,
    },
    sqlCount,
    neverRegraded,
    regradedLast7d: regraded7d,
    gradeChanges7d: gradeChangeRows
      .map((r) => ({ from: r.previous_grade ?? "?", to: r.grade, count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    bySource: bySourceRaw
      .map((r) => ({
        source: sourceName.get(r.source_id) ?? "(unknown)",
        count: r._count._all,
        avgFit: Math.round(r._avg.fit_score ?? 0),
        avgIntent: Math.round(r._avg.intent_score ?? 0),
        avgQuality: Math.round(r._avg.quality_score ?? 0),
        aPct: r._count._all > 0 ? Math.round(((aMap.get(r.source_id) ?? 0) / r._count._all) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
  }
}

/** Account + workspace options for the monitor's filter bar. */
export async function getScopeOptions(): Promise<{
  accounts: { id: string; name: string }[]
  sources: { key: string; name: string }[]
}> {
  const [accounts, sources] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leadSource.findMany({ select: { key: true, name: true }, distinct: ["key"], orderBy: { name: "asc" } }),
  ])
  return { accounts, sources }
}
