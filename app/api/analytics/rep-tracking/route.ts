import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { requireEntitlement, handleFeatureLock } from "@/lib/billing/entitlements"
import { apiSuccess, apiError } from "@/lib/api/response"
import { computeExecutionScore } from "@/lib/scoring/execution-score"
import { computeRepScore, type RepScoreComponents } from "@/lib/scoring/rep-score"
import { startOfIstDay, startOfIstMonth, hourIST } from "@/lib/time/ist"
import { RECOMMENDATION_TOP_N } from "@/lib/analytics/recommendation-rank"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/analytics/rep-tracking
 *
 * Powers the Sales Rep Tracking page. Computes per-rep + account-level KPIs:
 *   - ₹ Recovered (this month)        : sum of won_value for leads won by rep this month
 *   - Grade A Response Time (avg)     : avg speed_to_lead_hours for grade-A leads
 *   - Follow-up Completion (pct)      : completed / (completed + overdue) over last 30d
 *   - Follow-up Score (0-100)         : same as completion (legacy, kept for back-compat)
 *   - Daily Execution Score (0-100)   : NEW — see lib/scoring/execution-score
 *   - Conversion Rate (pct)           : NEW — won / qualified leads MTD
 *   - Rep Score (0-100)               : NEW — 5-component blend (see lib/scoring/rep-score)
 *
 * `follow_up_score` (legacy) and `rep_score` (new) ship in parallel for one
 * week of A/B sanity. Frontend reads `rep_score`; legacy callers see no
 * regression.
 *
 * Admin/Manager only.
 */
export async function GET() {
  try {
    const session   = await requireWorkspace("ADMIN", "MANAGER")
    await requireEntitlement(session.account.id, "rep_tracking")
    const accountId = session.account.id
    const workspaceId = session.workspace.id

    const now            = new Date()
    const monthStart     = startOfIstMonth(now)
    const lastMonthStart = startOfIstMonth(new Date(monthStart.getTime() - 1))
    const lastMonthEnd   = monthStart   // exclusive
    const dayStart       = startOfIstDay(now)
    const hr             = hourIST(now)

    // Detect this account's "qualified" stage (for conversion rate computation)
    const qualifiedStage = await prisma.pipelineStage.findFirst({
      where: { account_id: accountId, workspace_id: workspaceId, key: "qualified" },
      select: { id: true },
    })
    const qualifiedStageId = qualifiedStage?.id ?? null

    // ── Active reps in this account ────────────────────────────────────────
    const reps = await prisma.user.findMany({
      where: {
        account_id: accountId,
        is_active:  true,
        role:       { in: ["REP", "MANAGER", "ADMIN"] },
      },
      select: { id: true, first_name: true, last_name: true, role: true, email: true },
      orderBy: { first_name: "asc" },
    })

    // ── Account-level totals (this month vs last month) ─────────────────────
    const [
      revenueThisMonth, revenueLastMonth,
      avgRespThisMonth, avgRespLastMonth,
      fuCompletedThis, fuOverdueThis,
      fuCompletedLast, fuOverdueLast,
    ] = await Promise.all([
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: monthStart } },
        _sum:  { won_value: true },
      }),
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: lastMonthStart, lt: lastMonthEnd } },
        _sum:  { won_value: true },
      }),
      prisma.lead.aggregate({
        where: {
          account_id: accountId, workspace_id: workspaceId, grade: "A",
          first_contact_at: { gte: monthStart, not: null },
          speed_to_lead_hours: { not: null, gt: 0 },
        },
        _avg: { speed_to_lead_hours: true },
      }),
      prisma.lead.aggregate({
        where: {
          account_id: accountId, workspace_id: workspaceId, grade: "A",
          first_contact_at: { gte: lastMonthStart, lt: lastMonthEnd, not: null },
          speed_to_lead_hours: { not: null, gt: 0 },
        },
        _avg: { speed_to_lead_hours: true },
      }),
      prisma.followUpAction.count({
        where: {
          account_id: accountId, workspace_id: workspaceId, status: "COMPLETED",
          completed_at: { gte: monthStart },
        },
      }),
      prisma.followUpAction.count({
        where: {
          account_id: accountId, workspace_id: workspaceId, status: "OVERDUE",
          due_date: { gte: monthStart },
        },
      }),
      prisma.followUpAction.count({
        where: {
          account_id: accountId, workspace_id: workspaceId, status: "COMPLETED",
          completed_at: { gte: lastMonthStart, lt: lastMonthEnd },
        },
      }),
      prisma.followUpAction.count({
        where: {
          account_id: accountId, workspace_id: workspaceId, status: "OVERDUE",
          due_date: { gte: lastMonthStart, lt: lastMonthEnd },
        },
      }),
    ])

    const revRecovered = revenueThisMonth._sum.won_value ?? 0
    const revLast      = revenueLastMonth._sum.won_value ?? 0
    const avgRespHrs   = avgRespThisMonth._avg.speed_to_lead_hours ?? null
    const avgRespLast  = avgRespLastMonth._avg.speed_to_lead_hours ?? null

    const fuTotalThis  = fuCompletedThis + fuOverdueThis
    const fuPctThis    = fuTotalThis > 0 ? Math.round((fuCompletedThis / fuTotalThis) * 100) : null
    const fuTotalLast  = fuCompletedLast + fuOverdueLast
    const fuPctLast    = fuTotalLast > 0 ? Math.round((fuCompletedLast / fuTotalLast) * 100) : null

    const pctChange = (now: number | null, prev: number | null): number | null => {
      if (now == null || prev == null || prev === 0) return null
      return Math.round(((now - prev) / prev) * 100)
    }

    // ── Per-rep KPIs (parallel queries) ────────────────────────────────────
    const repStats = await Promise.all(
      reps.map(async (rep) => {
        const [
          revAgg, respAgg, fuComp, fuOver,
          execInputs, wonCount, qualifiedCount,
          missedRecovered, missedAtRisk,
          recsAccepted, recsIgnored,
        ] = await Promise.all([
          prisma.lead.aggregate({
            where: {
              account_id: accountId, workspace_id: workspaceId,
              assigned_rep_id: rep.id,
              won_at: { gte: monthStart },
            },
            _sum: { won_value: true },
          }),
          prisma.lead.aggregate({
            where: {
              account_id: accountId, workspace_id: workspaceId,
              assigned_rep_id: rep.id,
              grade: "A",
              first_contact_at: { gte: monthStart, not: null },
              speed_to_lead_hours: { not: null, gt: 0 },
            },
            _avg: { speed_to_lead_hours: true },
          }),
          prisma.followUpAction.count({
            where: {
              account_id: accountId, workspace_id: workspaceId, assigned_rep_id: rep.id,
              status: "COMPLETED", completed_at: { gte: monthStart },
            },
          }),
          prisma.followUpAction.count({
            where: {
              account_id: accountId, workspace_id: workspaceId, assigned_rep_id: rep.id,
              status: "OVERDUE", due_date: { gte: monthStart },
            },
          }),
          loadExecScoreInputs(accountId, workspaceId, rep.id, dayStart, hr),
          prisma.lead.count({
            where: {
              account_id: accountId, workspace_id: workspaceId, assigned_rep_id: rep.id,
              won_at: { gte: monthStart },
            },
          }),
          countQualifiedLeads(accountId, workspaceId, rep.id, monthStart, qualifiedStageId),
          // Missed-recovery: won_value of leads that were once is_missed and
          // were won this month. Uses Lead.won_at + a flag-tracking proxy via
          // notifications of type RECOVERY (or simply: leads with missed_at
          // and won_at in this month).
          prisma.lead.aggregate({
            where: {
              account_id: accountId, workspace_id: workspaceId, assigned_rep_id: rep.id,
              missed_at: { not: null },
              won_at:    { gte: monthStart, not: null },
            },
            _sum: { won_value: true },
          }),
          prisma.lead.aggregate({
            where: {
              account_id: accountId, workspace_id: workspaceId, assigned_rep_id: rep.id,
              missed_at: { gte: monthStart, not: null },
            },
            _sum: { expected_value: true },
          }),
          // Recommendation Adoption (MTD): leads first-contacted this month that
          // were in the rep's top-N queue at first touch ("accepted") vs below it.
          prisma.lead.count({
            where: {
              account_id: accountId, workspace_id: workspaceId, assigned_rep_id: rep.id,
              first_contact_at: { gte: monthStart },
              first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N },
            },
          }),
          prisma.lead.count({
            where: {
              account_id: accountId, workspace_id: workspaceId, assigned_rep_id: rep.id,
              first_contact_at: { gte: monthStart },
              first_action_rank: { gt: RECOMMENDATION_TOP_N },
            },
          }),
        ])

        const revenue       = revAgg._sum.won_value ?? 0
        const respHrs       = respAgg._avg.speed_to_lead_hours ?? null
        const responseSecs  = respHrs != null ? Math.round(respHrs * 3600) : null
        const fuTotal       = fuComp + fuOver
        const fuPct         = fuTotal > 0 ? Math.round((fuComp / fuTotal) * 100) : null

        // Exec score for today
        const execResult = computeExecutionScore(execInputs)

        // Conversion rate: won / qualified (MTD); null if no qualified yet
        const convRate = qualifiedCount > 0
          ? Math.round((wonCount / qualifiedCount) * 100)
          : null

        // Missed-recovery %: recovered / (recovered + still-at-risk)
        const recovered = missedRecovered._sum.won_value ?? 0
        const atRisk    = missedAtRisk._sum.expected_value ?? 0
        const recovPct  = (recovered + atRisk) > 0
          ? Math.round((recovered / (recovered + atRisk)) * 100)
          : null

        // Recommendation adoption %: accepted / (accepted + ignored)
        const recsTotal   = recsAccepted + recsIgnored
        const adoptionPct = recsTotal > 0 ? Math.round((recsAccepted / recsTotal) * 100) : null

        const repResult = computeRepScore({
          follow_up_pct:    fuPct ?? 0,
          speed_seconds:    responseSecs,
          missed_recov_pct: recovPct,
          exec_score:       execResult.score,
          conv_rate:        convRate,
        })

        return {
          id:                       rep.id,
          first_name:               rep.first_name,
          last_name:                rep.last_name,
          email:                    rep.email,
          role:                     rep.role,
          revenue_recovered:        revenue,
          response_time_seconds:    responseSecs,
          follow_up_completion_pct: fuPct,
          // Legacy field — kept for one week of A/B parallel ship
          follow_up_score:          fuPct,
          // New 5-component fields
          daily_execution_score:    execResult.score,
          conversion_rate:          convRate,
          missed_recovery_pct:      recovPct,
          recommendations_accepted:    recsAccepted,
          recommendations_ignored:     recsIgnored,
          recommendation_adoption_pct: adoptionPct,
          rep_score:                repResult.score,
          rep_score_components:     repResult.components as RepScoreComponents,
        }
      })
    )

    // Filter to reps that have at least one KPI present (cleaner table)
    const activeRepStats = repStats.filter((r) =>
      r.revenue_recovered > 0 || r.response_time_seconds != null || r.follow_up_completion_pct != null ||
      (r.recommendations_accepted + r.recommendations_ignored) > 0
    )

    // Account-level recommendation adoption (sum across reps)
    const acctRecsAccepted = activeRepStats.reduce((s, r) => s + r.recommendations_accepted, 0)
    const acctRecsTotal    = acctRecsAccepted + activeRepStats.reduce((s, r) => s + r.recommendations_ignored, 0)
    const acctAdoptionPct  = acctRecsTotal > 0 ? Math.round((acctRecsAccepted / acctRecsTotal) * 100) : null

    // Top performer = highest revenue_recovered this month
    const topPerformer = activeRepStats.length > 0
      ? [...activeRepStats].sort((a, b) => b.revenue_recovered - a.revenue_recovered)[0]
      : null

    return apiSuccess({
      account: {
        revenue_recovered:                revRecovered,
        revenue_recovered_pct_change:     pctChange(revRecovered, revLast),
        avg_response_time_seconds:        avgRespHrs != null ? Math.round(avgRespHrs * 3600) : null,
        avg_response_time_pct_change:     pctChange(avgRespHrs, avgRespLast),
        follow_up_completion_pct:         fuPctThis,
        follow_up_completion_pct_change:  pctChange(fuPctThis, fuPctLast),
        recommendation_adoption_pct:      acctAdoptionPct,
        recommendations_accepted:         acctRecsAccepted,
        recommendations_total:            acctRecsTotal,
      },
      reps:           activeRepStats,
      top_performer:  topPerformer ? {
        id:                topPerformer.id,
        first_name:        topPerformer.first_name,
        last_name:         topPerformer.last_name,
        revenue_recovered: topPerformer.revenue_recovered,
      } : null,
    })
  } catch (e) {
    return handleAuthError(e) ?? handleFeatureLock(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function loadExecScoreInputs(
  accountId: string,
  workspaceId: string,
  repId: string,
  dayStart: Date,
  hr: number,
) {
  const [
    fuDue, fuCompleted, fuOverdue,
    touched, abLeads, abContacted, signals,
  ] = await Promise.all([
    prisma.followUpAction.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId, due_date: { gte: dayStart } } }),
    prisma.followUpAction.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId, status: "COMPLETED", completed_at: { gte: dayStart } } }),
    prisma.followUpAction.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId, status: "OVERDUE" } }),
    prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId, last_action_at: { gte: dayStart } } }),
    prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId, grade: { in: ["A", "B"] }, imported_at: { gte: dayStart } } }),
    prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId, grade: { in: ["A", "B"] }, imported_at: { gte: dayStart }, first_contact_at: { not: null } } }),
    prisma.signal.count({ where: { user_id: repId, created_at: { gte: dayStart }, lead: { account_id: accountId, workspace_id: workspaceId } } }),
  ])
  return {
    fu_due_today:        fuDue,
    fu_completed_today:  fuCompleted,
    fu_overdue_now:      fuOverdue,
    leads_touched_today: touched,
    ab_leads_today:      abLeads,
    ab_leads_contacted:  abContacted,
    signals_today:       signals,
    hour_ist:            hr,
  }
}

/**
 * Count leads that have ever entered the qualified stage this month, scoped
 * to a single rep. Falls back to is_sql=true on the lead itself if the
 * account has no explicit "qualified" pipeline stage configured (older
 * accounts pre-PipelineStage).
 */
async function countQualifiedLeads(
  accountId: string,
  workspaceId: string,
  repId: string,
  monthStart: Date,
  qualifiedStageId: string | null,
): Promise<number> {
  if (qualifiedStageId) {
    // Count distinct leads (assigned to rep) whose StageHistory shows entry
    // into the qualified stage during this month.
    const rows = await prisma.stageHistory.findMany({
      where: {
        to_stage_id: qualifiedStageId,
        created_at:  { gte: monthStart },
        lead:        { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId },
      },
      select: { lead_id: true },
      distinct: ["lead_id"],
    })
    return rows.length
  }
  // Fallback for accounts without an explicit qualified stage
  return prisma.lead.count({
    where: {
      account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId,
      is_sql: true,
      // Use imported_at as "qualified-at" proxy when no StageHistory
      imported_at: { gte: monthStart },
    },
  })
}
