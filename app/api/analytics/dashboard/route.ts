import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/analytics/dashboard
 *
 * Returns KPIs, grade distribution, rep stats, and source truth cards.
 * Admin/Manager only. Used by useDashboard hook (60s polling).
 */
export async function GET(_req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")
    const accountId = session.account.id

    const today    = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const staleThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    const [
      totalLeads,
      newLast7d,
      sqlCount,
      staleLeads,
      callbacksDue,
      overdueFollowups,
      wonThisMonth,
      pipelineValue,
      gradeDistribution,
      repStats,
      sources,
    ] = await Promise.all([
      // Total active leads
      prisma.lead.count({
        where: { account_id: accountId, is_junk: false, won_at: null, lost_at: null },
      }),
      // New in last 7 days
      prisma.lead.count({
        where: { account_id: accountId, is_junk: false, created_at: { gte: sevenDaysAgo } },
      }),
      // SQL count
      prisma.lead.count({
        where: { account_id: accountId, is_sql: true, won_at: null, lost_at: null },
      }),
      // Stale (no contact in 14+ days)
      prisma.lead.count({
        where: {
          account_id:       accountId,
          is_junk:          false,
          won_at:           null,
          lost_at:          null,
          first_contact_at: { lt: staleThreshold },
        },
      }),
      // Callbacks due today
      prisma.followUpAction.count({
        where: {
          account_id: accountId,
          action_type: "CALL",
          status: "PENDING",
          due_date: { gte: today, lt: tomorrow },
        },
      }),
      // Overdue follow-ups
      prisma.followUpAction.count({
        where: { account_id: accountId, status: "OVERDUE" },
      }),
      // Won deal value this month
      prisma.lead.aggregate({
        where: { account_id: accountId, won_at: { gte: thirtyDaysAgo } },
        _sum: { won_value: true },
      }),
      // Pipeline value
      prisma.lead.aggregate({
        where: { account_id: accountId, is_junk: false, won_at: null, lost_at: null },
        _sum: { expected_value: true },
      }),
      // Grade distribution
      prisma.lead.groupBy({
        by:    ["grade"],
        where: { account_id: accountId, is_junk: false, won_at: null, lost_at: null },
        _count: { grade: true },
        orderBy: { grade: "asc" },
      }),
      // Rep stats
      prisma.user.findMany({
        where:  { account_id: accountId, role: "REP", is_active: true },
        select: {
          id: true, first_name: true, last_name: true,
          assigned_leads: {
            where:  { is_junk: false, won_at: null, lost_at: null },
            select: { grade: true, expected_value: true, speed_to_lead_hours: true },
          },
        },
      }),
      // Sources
      prisma.leadSource.findMany({
        where: { account_id: accountId },
        select: {
          id: true, name: true,
          leads: {
            where:  { account_id: accountId },
            select: { is_sql: true, won_at: true, intent_score: true, is_junk: true },
          },
        },
      }),
    ])

    // Compute grade distribution with percentages
    const total = totalLeads || 1
    const gradeDist = gradeDistribution.map((g) => ({
      grade: g.grade,
      count: g._count.grade,
      pct:   Math.round((g._count.grade / total) * 100),
    }))

    // Compute rep stats
    const repStatsComputed = repStats.map((rep) => {
      const leads   = rep.assigned_leads
      const speeds  = leads.map((l) => l.speed_to_lead_hours).filter((s): s is number => s != null)
      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null
      const missedValue = leads
        .filter((l) => l.grade === "A" || l.grade === "B")
        .reduce((s, l) => s + (l.expected_value ?? 0), 0)

      return {
        id:             rep.id,
        first_name:     rep.first_name,
        last_name:      rep.last_name,
        assigned:       leads.length,
        follow_up_pct:  75,   // TODO: compute from follow-up actions
        speed_to_lead:  avgSpeed,
        missed_value:   missedValue,
      }
    })

    // Compute source truth
    const sourceTruth = sources.map((src) => {
      const nonJunk = src.leads.filter((l) => !l.is_junk)
      const sqlCount = nonJunk.filter((l) => l.is_sql).length
      const wonCount = nonJunk.filter((l) => l.won_at != null).length
      const avgIntent = nonJunk.length > 0
        ? Math.round(nonJunk.reduce((s, l) => s + l.intent_score, 0) / nonJunk.length)
        : 0
      return {
        id:              src.id,
        name:            src.name,
        total_leads:     nonJunk.length,
        sql_count:       sqlCount,
        won_count:       wonCount,
        avg_intent:      avgIntent,
        conversion_rate: nonJunk.length > 0 ? Math.round((wonCount / nonJunk.length) * 100) : 0,
      }
    }).filter((s) => s.total_leads > 0)

    return apiSuccess({
      kpis: {
        total_leads:       totalLeads,
        new_last_7d:       newLast7d,
        sql_count:         sqlCount,
        stale_leads:       staleLeads,
        callbacks_due:     callbacksDue,
        overdue_followups: overdueFollowups,
        won_this_month:    wonThisMonth._sum.won_value ?? 0,
        pipeline_value:    pipelineValue._sum.expected_value ?? 0,
      },
      grade_distribution: gradeDist,
      rep_stats:          repStatsComputed,
      source_truth:       sourceTruth,
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Dashboard analytics error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
