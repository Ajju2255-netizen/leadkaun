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
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
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
      aLeads,
      bLeads,
      actedTodaySignals,
      missedLeads,
      stageBreakdown,
      stuckContacted,
      dueTodayFollowups,
      overdueFollowupLeads,
      sources,
      yesterdayMissed,
      atRiskSoon,
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
            select: { grade: true, expected_value: true, speed_to_lead_hours: true, is_missed: true },
          },
        },
      }),
      // A leads in queue (not missed/won/lost/junk)
      prisma.lead.aggregate({
        where: { account_id: accountId, grade: "A", is_missed: false, won_at: null, lost_at: null, is_junk: false },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // B leads in queue
      prisma.lead.aggregate({
        where: { account_id: accountId, grade: "B", is_missed: false, won_at: null, lost_at: null, is_junk: false },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // A/B leads with a signal logged today (distinct lead)
      prisma.signal.findMany({
        where: { account_id: accountId, created_at: { gte: today }, lead: { grade: { in: ["A", "B"] } } },
        select: { lead_id: true, lead: { select: { expected_value: true } } },
        distinct: ["lead_id"],
      }),
      // Missed leads
      prisma.lead.aggregate({
        where: { account_id: accountId, is_missed: true, won_at: null, lost_at: null },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // Pipeline stages (non-terminal) with lead counts+values
      prisma.pipelineStage.findMany({
        where: { account_id: accountId, is_terminal: false },
        select: {
          name: true, key: true, display_order: true,
          leads: {
            where: { is_junk: false, won_at: null, lost_at: null },
            select: { expected_value: true },
          },
        },
        orderBy: { display_order: "asc" },
      }),
      // Leads stuck in "contacted" stage > 48h
      prisma.lead.count({
        where: {
          account_id: accountId, is_junk: false, won_at: null, lost_at: null,
          stage: { key: "contacted" },
          stage_entered_at: { lt: new Date(Date.now() - 48 * 3_600_000) },
        },
      }),
      // Follow-ups due today
      prisma.followUpAction.findMany({
        where: { account_id: accountId, status: "PENDING", due_date: { gte: today, lt: tomorrow } },
        select: { lead: { select: { expected_value: true } } },
      }),
      // Overdue follow-ups distinct by lead
      prisma.followUpAction.findMany({
        where: { account_id: accountId, status: "OVERDUE" },
        select: { lead_id: true, lead: { select: { expected_value: true } } },
        distinct: ["lead_id"],
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
      // Yesterday missed leads (approximate via updated_at when is_missed was set)
      prisma.lead.aggregate({
        where: { account_id: accountId, is_missed: true, updated_at: { gte: yesterday, lt: today } },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // A leads about to go cold: last signal 20-24h ago (within 4h of being missed)
      prisma.signal.findMany({
        where: {
          account_id: accountId,
          created_at: { gte: new Date(Date.now() - 24 * 3_600_000), lt: new Date(Date.now() - 20 * 3_600_000) },
          lead: { grade: "A", is_missed: false, won_at: null, lost_at: null, is_junk: false },
        },
        distinct: ["lead_id"],
        select: { lead_id: true, lead: { select: { expected_value: true } } },
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
      const missedLeadsForRep = leads.filter((l) => l.is_missed)
      const missedValue = missedLeadsForRep.reduce((s, l) => s + (l.expected_value ?? 0), 0)

      return {
        id:            rep.id,
        first_name:    rep.first_name,
        last_name:     rep.last_name,
        assigned:      leads.length,
        speed_to_lead: avgSpeed,
        missed_count:  missedLeadsForRep.length,
        missed_value:  missedValue,
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

    // At risk soon
    const atRiskSoonValue = atRiskSoon.reduce((s, a) => s + (a.lead?.expected_value ?? 0), 0)

    // Efficiency score: acted today / (at_risk + overdue follow-ups + due today), clamped 0-100
    const efDenominator = (aLeads._count.id ?? 0) + (bLeads._count.id ?? 0) + overdueFollowups + dueTodayFollowups.length
    const efficiencyScore = efDenominator > 0
      ? Math.min(100, Math.round((actedTodaySignals.length / efDenominator) * 100))
      : 100

    // Compute today snapshot values
    const atRiskTotal  = (aLeads._count.id ?? 0) + (bLeads._count.id ?? 0)
    const atRiskValue  = (aLeads._sum.expected_value ?? 0) + (bLeads._sum.expected_value ?? 0)
    const actedValue   = actedTodaySignals.reduce((s, a) => s + (a.lead?.expected_value ?? 0), 0)

    // Pipeline stages
    const stageData = stageBreakdown.map((s) => ({
      name:  s.name,
      key:   s.key,
      count: s.leads.length,
      value: s.leads.reduce((sum, l) => sum + (l.expected_value ?? 0), 0),
    }))

    // Follow-up values
    const dueTodayValue   = dueTodayFollowups.reduce((s, a) => s + (a.lead?.expected_value ?? 0), 0)
    const overdueValue    = overdueFollowupLeads.reduce((s, a) => s + (a.lead?.expected_value ?? 0), 0)

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
      today: {
        at_risk_count:  atRiskTotal,
        at_risk_value:  atRiskValue,
        acted_count:    actedTodaySignals.length,
        acted_value:    actedValue,
        missed_count:   missedLeads._count.id ?? 0,
        missed_value:   missedLeads._sum.expected_value ?? 0,
      },
      action_required: {
        a_count:          aLeads._count.id ?? 0,
        a_value:          aLeads._sum.expected_value ?? 0,
        b_count:          bLeads._count.id ?? 0,
        b_value:          bLeads._sum.expected_value ?? 0,
        overdue_fu_count: overdueFollowups,
        overdue_fu_value: overdueValue,
      },
      pipeline: {
        stages:          stageData,
        stuck_contacted: stuckContacted,
      },
      followups: {
        due_today:       dueTodayFollowups.length,
        due_today_value: dueTodayValue,
        overdue:         overdueFollowups,
        overdue_value:   overdueValue,
      },
      insights: {
        efficiency_score:    efficiencyScore,
        at_risk_soon_count:  atRiskSoon.length,
        at_risk_soon_value:  atRiskSoonValue,
        yesterday_missed_count: yesterdayMissed._count.id ?? 0,
        yesterday_missed_value: yesterdayMissed._sum.expected_value ?? 0,
      },
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Dashboard analytics error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
