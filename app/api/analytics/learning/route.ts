import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { requireEntitlement, handleFeatureLock } from "@/lib/billing/entitlements"
import { apiSuccess, apiError } from "@/lib/api/response"
import { inferIndustry } from "@/lib/import/enrich-lead"
import { hourIST } from "@/lib/time/ist"
import {
  calibration, closeTimeByGrade, winBySegment, bestHour, LEARNING_GATES,
  type Calibration, type CloseTime, type SegmentWin, type BestHour,
} from "@/lib/analytics/learning"
import { RECOMMENDATION_TOP_N } from "@/lib/analytics/recommendation-rank"
import type { SignalType } from "@prisma/client"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/analytics/learning
 * The Learning Engine — account-level patterns Leadkaun has learned, each
 * gated by sample size (honest "still learning" below threshold). Admin/Manager.
 */

type Insight = {
  key: string
  title: string
  status: "ready" | "learning"
  headline?: string
  detail?: string
  items?: unknown[]
  cta?: { label: string; href: string }
  need?: string
}

const POSITIVE_SIGNALS: SignalType[] = [
  "CALL_ANSWERED_INTERESTED", "CALL_ANSWERED_CALLBACK",
  "WA_REPLIED_1H", "WA_REPLIED_4H", "WA_REPLIED_24H",
] as SignalType[]

export async function GET() {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")
    await requireEntitlement(session.account.id, "ai_learning")
    const accountId = session.account.id
    const workspaceId = session.workspace.id

    const [decidedLeads, totalLeads, account, posSignals, reps] = await Promise.all([
      prisma.lead.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, OR: [{ won_at: { not: null } }, { lost_at: { not: null } }] },
        select: { grade: true, won_at: true, lost_at: true, imported_at: true, company_name: true, outcome_snapshot: true },
      }),
      prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId } }),
      prisma.account.findUnique({ where: { id: accountId }, select: { icp_industries: true } }),
      prisma.signal.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, signal_type: { in: POSITIVE_SIGNALS } },
        select: { created_at: true }, take: 5000,
      }),
      prisma.user.findMany({
        where: { account_id: accountId, role: { in: ["REP", "MANAGER"] }, is_active: true },
        select: { id: true, first_name: true, last_name: true },
      }),
    ])

    // Grade at the moment of decision (frozen in outcome_snapshot), else current.
    const decided = decidedLeads.map((l) => {
      const snap = l.outcome_snapshot as { grade?: string } | null
      const won = l.won_at != null
      return {
        grade: snap?.grade ?? l.grade,
        won,
        company_name: l.company_name,
        days: won && l.won_at ? Math.max(0, Math.round((l.won_at.getTime() - l.imported_at.getTime()) / 86_400_000)) : null,
      }
    })

    const calib = calibration(decided.map((d) => ({ grade: d.grade, won: d.won })))
    const closeTime = closeTimeByGrade(decided.filter((d) => d.won && d.days != null).map((d) => ({ grade: d.grade, days: d.days! })))
    // Only segment by RECOGNISED industries — the catch-all "Other" bucket isn't an insight.
    const segRows = decided
      .map((d) => ({ segment: inferIndustry(d.company_name), won: d.won }))
      .filter((r): r is { segment: string; won: boolean } => r.segment != null)
    const segments = winBySegment(segRows)
    const peak = bestHour(posSignals.map((s) => hourIST(s.created_at)))

    const icpSet = new Set((account?.icp_industries ?? []).map((s) => s.toLowerCase()))
    const icpSuggestions = segments.filter((s) => s.winRate >= 50 && s.segment !== "Other" && !icpSet.has(s.segment.toLowerCase()))

    const repStats = await Promise.all(reps.map(async (r) => {
      const [accepted, ranked, won, dec] = await Promise.all([
        prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: r.id, first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N } } }),
        prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: r.id, first_action_rank: { not: null } } }),
        prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: r.id, won_at: { not: null } } }),
        prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: r.id, OR: [{ won_at: { not: null } }, { lost_at: { not: null } }] } }),
      ])
      return {
        name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
        adoptionPct: ranked > 0 ? Math.round((accepted / ranked) * 100) : null,
        ranked,
        conversionPct: dec > 0 ? Math.round((won / dec) * 100) : null,
      }
    }))
    const repsWithAdoption = repStats.filter((r) => r.ranked > 0).sort((a, b) => (b.adoptionPct ?? 0) - (a.adoptionPct ?? 0))

    const insights: Insight[] = [
      calibrationInsight(calib),
      closeTimeInsight(closeTime),
      segmentInsight(segments),
      icpInsight(icpSuggestions),
      bestTimeInsight(peak),
      repCoachingInsight(repsWithAdoption),
    ]
    const unlocked = insights.filter((i) => i.status === "ready").length

    return apiSuccess({
      maturity: { decided: decided.length, leads_total: totalLeads, unlocked, total: insights.length },
      insights,
    })
  } catch (e) {
    return handleAuthError(e) ?? handleFeatureLock(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ── Insight builders ─────────────────────────────────────────────────────────

function calibrationInsight(c: Calibration): Insight {
  const base = { key: "calibration", title: "Scoring accuracy" }
  if (c.decided < LEARNING_GATES.calibrationDecided) {
    return { ...base, status: "learning", need: `${LEARNING_GATES.calibrationDecided - c.decided} more closed deals` }
  }
  const headline = c.lift != null && c.lift >= 1.3
    ? `Your A/B leads win ${c.lift}× more often than D/E`
    : c.accuracy != null
      ? `Your grades match the outcome ${c.accuracy}% of the time`
      : "Tracking how well grades predict wins"
  return {
    ...base, status: "ready", headline,
    detail: c.accuracy != null
      ? `${c.accuracy}% of graded leads ended the way the grade predicted, across ${c.decided} decided leads.`
      : `Across ${c.decided} decided leads.`,
    items: c.perGrade,
  }
}

function closeTimeInsight(ct: CloseTime[]): Insight {
  const base = { key: "close_time", title: "Close time by grade" }
  if (ct.length === 0) return { ...base, status: "learning", need: `at least ${LEARNING_GATES.closeTimePerGrade} won deals in a grade` }
  const fastest = [...ct].sort((a, b) => a.medianDays - b.medianDays)[0]
  const slowest = [...ct].sort((a, b) => b.medianDays - a.medianDays)[0]
  const headline = fastest.grade !== slowest.grade
    ? `${fastest.grade}-grade leads close in ~${fastest.medianDays} days, ${slowest.grade}-grade in ~${slowest.medianDays}`
    : `${fastest.grade}-grade leads close in ~${fastest.medianDays} days`
  return { ...base, status: "ready", headline, detail: "Median days from import to won.", items: ct }
}

function segmentInsight(segs: SegmentWin[]): Insight {
  const base = { key: "segments", title: "Win rate by segment" }
  if (segs.length === 0) return { ...base, status: "learning", need: `${LEARNING_GATES.segmentDecided} decided leads in a segment` }
  const top = segs[0]
  const bottom = segs[segs.length - 1]
  const headline = segs.length > 1
    ? `You win ${top.segment} ${top.winRate}%, ${bottom.segment} ${bottom.winRate}%`
    : `You win ${top.segment} ${top.winRate}%`
  return { ...base, status: "ready", headline, detail: "Win rate = won ÷ decided, per inferred industry.", items: segs }
}

function icpInsight(suggestions: SegmentWin[]): Insight {
  const base = { key: "icp_evolution", title: "Evolve your ICP" }
  if (suggestions.length === 0) {
    return { ...base, status: "learning", need: "a high-win segment that isn't already in your ICP" }
  }
  const top = suggestions[0]
  return {
    ...base, status: "ready",
    headline: `You win ${top.segment} ${top.winRate}% — but it isn't in your ICP`,
    detail: "Adding your proven winners to the ICP re-grades leads to match how you actually sell.",
    items: suggestions,
    cta: { label: "Review ICP", href: "/settings/icp" },
  }
}

function bestTimeInsight(peak: BestHour | null): Insight {
  const base = { key: "best_time", title: "Best time to reach leads" }
  const total = peak?.total ?? 0
  if (!peak || total < LEARNING_GATES.bestTimeSignals) {
    return { ...base, status: "learning", need: `${LEARNING_GATES.bestTimeSignals - total} more replies or answered calls logged` }
  }
  return {
    ...base, status: "ready",
    headline: `Leads respond most around ${fmtHourRange(peak.hour)}`,
    detail: `Based on ${peak.count} of ${peak.total} positive responses landing in that window.`,
    items: [{ hour: peak.hour, count: peak.count }],
  }
}

function repCoachingInsight(reps: { name: string; adoptionPct: number | null; conversionPct: number | null; ranked: number }[]): Insight {
  const base = { key: "rep_coaching", title: "Rep coaching" }
  if (reps.length < LEARNING_GATES.repCoachingReps) {
    return { ...base, status: "learning", need: "more reps working recommended leads" }
  }
  const top = reps[0]
  const bottom = reps[reps.length - 1]
  const headline = `${top.name} works ${top.adoptionPct}% of recommendations; ${bottom.name} ${bottom.adoptionPct}%`
  return { ...base, status: "ready", headline, detail: "Adoption = first-touch on a top-queue lead. Compare it with each rep's conversion.", items: reps }
}

function fmtHourRange(h: number): string {
  const fmt = (x: number) => {
    const hr = ((x % 24) + 24) % 24
    const ampm = hr < 12 ? "am" : "pm"
    const h12 = hr % 12 === 0 ? 12 : hr % 12
    return `${h12}${ampm}`
  }
  return `${fmt(h)}–${fmt(h + 2)}`
}
