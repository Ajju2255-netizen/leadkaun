import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/leads/stats
 *
 * Powers the three stats tiles under the All Leads table:
 *   - scoring_speed_ms : avg ms per lead from completed import jobs
 *   - score_breakdown  : avg fit/intent/quality + computed avg total score (out of 100)
 *   - score_decay_pct  : % drop in avg intent_score for leads imported 7-13 days ago
 *                        vs leads imported 0-6 days ago — captures "how cold are we trending"
 *
 * All numbers scope to the current account.
 */
export async function GET() {
  try {
    const session = await requireWorkspace()
    const accountId = session.account.id
    const workspaceId = session.workspace.id

    // ── 1. Scoring speed — avg ms per lead from import jobs ─────────────────
    const completedJobs = await prisma.importJobStatus.findMany({
      where: {
        account_id: accountId, workspace_id: workspaceId,
        status: "COMPLETE",
        completed_at: { not: null },
        total_rows: { gt: 0 },
      },
      select: { created_at: true, completed_at: true, total_rows: true },
      orderBy: { created_at: "desc" },
      take: 20, // last 20 jobs
    })

    let scoringSpeedMs: number | null = null
    if (completedJobs.length > 0) {
      const totalMs = completedJobs.reduce((acc, j) => {
        const ms = (j.completed_at!.getTime() - j.created_at.getTime())
        return acc + ms
      }, 0)
      const totalRows = completedJobs.reduce((acc, j) => acc + (j.total_rows ?? 0), 0)
      scoringSpeedMs = totalRows > 0 ? Math.round(totalMs / totalRows) : null
    }

    // ── 2. Score breakdown — avg fit / intent / quality across non-junk leads ─
    const agg = await prisma.lead.aggregate({
      where: { account_id: accountId, workspace_id: workspaceId, is_junk: false },
      _avg: { fit_score: true, intent_score: true, quality_score: true },
      _count: { _all: true },
    })

    const avgFit     = Math.round(agg._avg.fit_score     ?? 0)
    const avgIntent  = Math.round(agg._avg.intent_score  ?? 0)
    const avgQuality = Math.round(agg._avg.quality_score ?? 0)

    // Weighted average score out of 100 — fit is most important (40%), intent and quality 30% each.
    // These weights match the visual-design treatment: Fit /40 · Intent /30 · Quality /30.
    const avgTotal = Math.round(avgFit * 0.40 + avgIntent * 0.30 + avgQuality * 0.30)

    // Each dimension's contribution to the average total (in raw score-points out of 100)
    const fitContribution     = Math.round(avgFit     * 0.40)
    const intentContribution  = Math.round(avgIntent  * 0.30)
    const qualityContribution = Math.round(avgQuality * 0.30)

    const totalContribution = fitContribution + intentContribution + qualityContribution || 1
    const fitSharePct     = Math.round((fitContribution     / totalContribution) * 100)
    const intentSharePct  = Math.round((intentContribution  / totalContribution) * 100)
    // Quality share is the remainder so the three add to exactly 100 even after rounding.
    const qualitySharePct = 100 - fitSharePct - intentSharePct

    // ── 3. Score decay — compare avg intent of fresh vs older windows ───────
    const now    = Date.now()
    const day7   = new Date(now - 7  * 86_400_000)
    const day14  = new Date(now - 14 * 86_400_000)

    const [recentAgg, olderAgg] = await Promise.all([
      prisma.lead.aggregate({
        where: {
          account_id: accountId, workspace_id: workspaceId,
          is_junk: false,
          imported_at: { gte: day7 },
        },
        _avg: { intent_score: true },
        _count: { _all: true },
      }),
      prisma.lead.aggregate({
        where: {
          account_id: accountId, workspace_id: workspaceId,
          is_junk: false,
          imported_at: { gte: day14, lt: day7 },
        },
        _avg: { intent_score: true },
        _count: { _all: true },
      }),
    ])

    let scoreDecayPct: number | null = null
    let decayWindowDays: number | null = null

    if ((olderAgg._count?._all ?? 0) >= 1 && (recentAgg._count?._all ?? 0) >= 1) {
      const oldI = olderAgg._avg.intent_score  ?? 0
      const newI = recentAgg._avg.intent_score ?? 0
      if (oldI > 0) {
        scoreDecayPct  = Math.round(((newI - oldI) / oldI) * 100) // negative = decay
        decayWindowDays = 7
      }
    }

    return apiSuccess({
      scoring_speed_ms: scoringSpeedMs,
      score_breakdown: {
        avg_total:    avgTotal,
        avg_fit:      avgFit,
        avg_intent:   avgIntent,
        avg_quality:  avgQuality,
        fit_share_pct:     fitSharePct,
        intent_share_pct:  intentSharePct,
        quality_share_pct: qualitySharePct,
      },
      score_decay: {
        pct:          scoreDecayPct,    // negative = scores trending lower
        window_days:  decayWindowDays,  // null when not enough data
      },
      lead_count: agg._count?._all ?? 0,
    })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
