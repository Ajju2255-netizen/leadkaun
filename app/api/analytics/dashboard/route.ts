import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/analytics/dashboard
 *
 * Returns KPIs, grade distribution, rep stats, and source truth cards.
 * Admin/Manager only. Used by useDashboard hook (60s polling).
 *
 * Rep stats, stage breakdown and source truth are computed with grouped
 * aggregates (groupBy) rather than loading every lead row into memory — the
 * old version pulled the full lead table ~3× on every 60s poll.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")
    const accountId = session.account.id
    const workspaceId = session.workspace.id

    const today    = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const staleThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    // Shared "active lead" predicate: not junk, not won, not lost.
    const activeLeadWhere = {
      account_id: accountId, workspace_id: workspaceId,
      is_junk: false, won_at: null, lost_at: null,
    }

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
      aLeads,
      bLeads,
      actedTodaySignals,
      missedLeads,
      stuckContacted,
      dueTodayFollowups,
      overdueFollowupLeads,
      yesterdayMissed,
      atRiskSoon,
      // Rep stats (aggregated): names + per-rep active-lead and missed aggregates.
      repList,
      leadAggByRep,
      missedAggByRep,
      // Pipeline stage breakdown (aggregated).
      stageList,
      leadsByStage,
      // Source truth (aggregated).
      sourceList,
      srcTotals,
      srcSql,
      srcWon,
    ] = await Promise.all([
      // Total active leads
      prisma.lead.count({ where: activeLeadWhere }),
      // New in last 7 days
      prisma.lead.count({
        where: { account_id: accountId, workspace_id: workspaceId, is_junk: false, created_at: { gte: sevenDaysAgo } },
      }),
      // SQL count
      prisma.lead.count({
        where: { account_id: accountId, workspace_id: workspaceId, is_sql: true, won_at: null, lost_at: null },
      }),
      // Stale (no contact in 14+ days)
      prisma.lead.count({
        where: { ...activeLeadWhere, first_contact_at: { lt: staleThreshold } },
      }),
      // Callbacks due today
      prisma.followUpAction.count({
        where: {
          account_id: accountId, workspace_id: workspaceId,
          action_type: "CALL", status: "PENDING",
          due_date: { gte: today, lt: tomorrow },
        },
      }),
      // Overdue follow-ups
      prisma.followUpAction.count({
        where: { account_id: accountId, workspace_id: workspaceId, status: "OVERDUE" },
      }),
      // Won deal value this month
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: thirtyDaysAgo } },
        _sum: { won_value: true },
      }),
      // Pipeline value
      prisma.lead.aggregate({ where: activeLeadWhere, _sum: { expected_value: true } }),
      // Grade distribution
      prisma.lead.groupBy({
        by: ["grade"],
        where: activeLeadWhere,
        _count: { grade: true },
        orderBy: { grade: "asc" },
      }),
      // A leads in queue (not missed/won/lost/junk)
      prisma.lead.aggregate({
        where: { ...activeLeadWhere, grade: "A", is_missed: false },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // B leads in queue
      prisma.lead.aggregate({
        where: { ...activeLeadWhere, grade: "B", is_missed: false },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // A/B leads with a signal logged today (distinct lead)
      prisma.signal.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, created_at: { gte: today }, lead: { grade: { in: ["A", "B"] } } },
        select: { lead_id: true, lead: { select: { expected_value: true } } },
        distinct: ["lead_id"],
      }),
      // Missed leads
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, is_missed: true, won_at: null, lost_at: null },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // Leads stuck in "contacted" stage > 48h
      prisma.lead.count({
        where: {
          ...activeLeadWhere,
          stage: { key: "contacted" },
          stage_entered_at: { lt: new Date(Date.now() - 48 * 3_600_000) },
        },
      }),
      // Follow-ups due today
      prisma.followUpAction.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, status: "PENDING", due_date: { gte: today, lt: tomorrow } },
        select: { lead: { select: { expected_value: true } } },
      }),
      // Overdue follow-ups distinct by lead
      prisma.followUpAction.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, status: "OVERDUE" },
        select: { lead_id: true, lead: { select: { expected_value: true } } },
        distinct: ["lead_id"],
      }),
      // Yesterday missed leads (approximate via updated_at when is_missed was set)
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, is_missed: true, updated_at: { gte: yesterday, lt: today } },
        _count: { id: true }, _sum: { expected_value: true },
      }),
      // A leads about to go cold: last signal 20-24h ago (within 4h of being missed)
      prisma.signal.findMany({
        where: {
          account_id: accountId, workspace_id: workspaceId,
          created_at: { gte: new Date(Date.now() - 24 * 3_600_000), lt: new Date(Date.now() - 20 * 3_600_000) },
          lead: { grade: "A", is_missed: false, won_at: null, lost_at: null, is_junk: false },
        },
        distinct: ["lead_id"],
        select: { lead_id: true, lead: { select: { expected_value: true } } },
      }),
      // Rep names (all active reps, incl. those with 0 leads)
      prisma.user.findMany({
        where: { account_id: accountId, role: "REP", is_active: true },
        select: { id: true, first_name: true, last_name: true },
      }),
      // Active leads per rep → assigned count + avg speed-to-lead
      prisma.lead.groupBy({
        by: ["assigned_rep_id"],
        where: { ...activeLeadWhere, assigned_rep_id: { not: null } },
        _count: true, _avg: { speed_to_lead_hours: true },
      }),
      // Missed active leads per rep → missed count + missed value
      prisma.lead.groupBy({
        by: ["assigned_rep_id"],
        where: { ...activeLeadWhere, is_missed: true, assigned_rep_id: { not: null } },
        _count: true, _sum: { expected_value: true },
      }),
      // Non-terminal pipeline stages
      prisma.pipelineStage.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, is_terminal: false },
        select: { id: true, name: true, key: true, display_order: true },
        orderBy: { display_order: "asc" },
      }),
      // Active leads per stage → count + value
      prisma.lead.groupBy({
        by: ["stage_id"],
        where: activeLeadWhere,
        _count: true, _sum: { expected_value: true },
      }),
      // Source names
      prisma.leadSource.findMany({
        where: { account_id: accountId, workspace_id: workspaceId },
        select: { id: true, name: true },
      }),
      // Non-junk totals + avg intent per source
      prisma.lead.groupBy({
        by: ["source_id"],
        where: { account_id: accountId, workspace_id: workspaceId, is_junk: false },
        _count: true, _avg: { intent_score: true },
      }),
      // Non-junk SQL per source
      prisma.lead.groupBy({
        by: ["source_id"],
        where: { account_id: accountId, workspace_id: workspaceId, is_junk: false, is_sql: true },
        _count: true,
      }),
      // Non-junk won per source
      prisma.lead.groupBy({
        by: ["source_id"],
        where: { account_id: accountId, workspace_id: workspaceId, is_junk: false, won_at: { not: null } },
        _count: true,
      }),
    ])

    // Compute grade distribution with percentages
    const total = totalLeads || 1
    const gradeDist = gradeDistribution.map((g) => ({
      grade: g.grade,
      count: g._count.grade,
      pct:   Math.round((g._count.grade / total) * 100),
    }))

    // Compute rep stats from grouped aggregates
    const leadByRep   = new Map(leadAggByRep.map((r) => [r.assigned_rep_id, r]))
    const missedByRep = new Map(missedAggByRep.map((r) => [r.assigned_rep_id, r]))
    const repStatsComputed = repList.map((rep) => {
      const a = leadByRep.get(rep.id)
      const m = missedByRep.get(rep.id)
      return {
        id:            rep.id,
        first_name:    rep.first_name,
        last_name:     rep.last_name,
        assigned:      a?._count ?? 0,
        speed_to_lead: a?._avg.speed_to_lead_hours ?? null,
        missed_count:  m?._count ?? 0,
        missed_value:  m?._sum.expected_value ?? 0,
      }
    })

    // Compute source truth from grouped aggregates
    const sqlBySource  = new Map(srcSql.map((s) => [s.source_id, s._count]))
    const wonBySource  = new Map(srcWon.map((s) => [s.source_id, s._count]))
    const sourceName   = new Map(sourceList.map((s) => [s.id, s.name]))
    const sourceTruth = srcTotals
      .filter((t) => t.source_id != null && t._count > 0 && sourceName.has(t.source_id))
      .map((t) => {
        const totalLeadsSrc = t._count
        const wonCount = wonBySource.get(t.source_id) ?? 0
        return {
          id:              t.source_id!,
          name:            sourceName.get(t.source_id)!,
          total_leads:     totalLeadsSrc,
          sql_count:       sqlBySource.get(t.source_id) ?? 0,
          won_count:       wonCount,
          avg_intent:      Math.round(t._avg.intent_score ?? 0),
          conversion_rate: totalLeadsSrc > 0 ? Math.round((wonCount / totalLeadsSrc) * 100) : 0,
        }
      })

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
    const stageAggById = new Map(leadsByStage.map((s) => [s.stage_id, s]))
    const stageData = stageList.map((s) => {
      const agg = stageAggById.get(s.id)
      return {
        name:  s.name,
        key:   s.key,
        count: agg?._count ?? 0,
        value: agg?._sum.expected_value ?? 0,
      }
    })

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
