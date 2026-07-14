import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { startOfIstDay, IST_OFFSET_MS } from "@/lib/time/ist"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/analytics/intelligence
 * Loss intelligence, pattern detection, prediction, source performance.
 * Admin/Manager only.
 */
export async function GET(req: Request) {
  try {
    const session   = await requireWorkspace("ADMIN", "MANAGER")
    const accountId = session.account.id
    const workspaceId = session.workspace.id

    const { searchParams } = new URL(req.url)
    const periodParam = searchParams.get("period") ?? "30d"
    const periodDays  = periodParam === "7d" ? 7 : periodParam === "90d" ? 90 : 30
    const since       = new Date(Date.now() - periodDays * 86_400_000)

    // Keep sevenDaysAgo for the trend chart (always 7-day window)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)

    const [
      missedLeads,
      wonLeadsSpeed,
      missedLeadsSpeed,
      recentMissed,
      overdueLeads,
      sources,
      repStats,
      followUpConfigs,
      wonByGrade,
    ] = await Promise.all([
      // All missed leads with follow-up context (for loss reason classification)
      prisma.lead.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, is_missed: true },
        select: {
          id:                  true,
          expected_value:      true,
          grade:               true,
          speed_to_lead_hours: true,
          missed_at:           true,
          follow_up_actions: {
            select: { status: true },
          },
        },
      }),
      // Won leads avg speed (selected period)
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: since } },
        _avg: { speed_to_lead_hours: true },
        _count: { id: true },
      }),
      // Missed leads avg speed
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, is_missed: true },
        _avg: { speed_to_lead_hours: true },
      }),
      // Recent missed leads for trend (last 7 days, by missed_at)
      prisma.lead.findMany({
        where: { account_id: accountId, workspace_id: workspaceId, is_missed: true, missed_at: { gte: sevenDaysAgo } },
        select: { expected_value: true, missed_at: true },
        orderBy: { missed_at: "asc" },
      }),
      // Currently overdue follow-up leads (for recovery calc)
      prisma.followUpAction.findMany({
        where:  { account_id: accountId, workspace_id: workspaceId, status: "OVERDUE" },
        select: { lead_id: true, lead: { select: { expected_value: true } } },
        distinct: ["lead_id"],
      }),
      // Source performance
      prisma.leadSource.findMany({
        where: { account_id: accountId, workspace_id: workspaceId },
        select: {
          id: true, name: true,
          leads: {
            where:  { account_id: accountId, workspace_id: workspaceId },
            select: { is_sql: true, won_at: true, is_missed: true, intent_score: true, is_junk: true, expected_value: true },
          },
        },
      }),
      // Rep performance
      prisma.user.findMany({
        where:  { account_id: accountId, role: "REP", is_active: true },
        select: {
          id: true, first_name: true, last_name: true,
          assigned_leads: {
            where:  { is_junk: false },
            select: {
              grade: true, expected_value: true,
              speed_to_lead_hours: true, is_missed: true,
              won_at: true, won_value: true,
            },
          },
        },
      }),
      // Current follow-up configs (for Apply Fix comparison)
      prisma.followUpConfig.findMany({
        where:   { account_id: accountId, workspace_id: workspaceId },
        orderBy: { grade: "asc" },
        select:  { grade: true, schedule: true },
      }),
      // Won leads avg speed by grade (selected period)
      prisma.lead.groupBy({
        by:    ["grade"],
        where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: since } },
        _avg:  { speed_to_lead_hours: true },
        _count: { id: true },
      }),
    ])

    // ── Loss reason classification ─────────────────────────────────────────

    const sumValue = (leads: { expected_value: number | null }[]) =>
      leads.reduce((s, l) => s + (l.expected_value ?? 0), 0)

    const neverContacted: typeof missedLeads = []
    const followUpGap:    typeof missedLeads = []
    const engagedLapsed:  typeof missedLeads = []

    for (const lead of missedLeads) {
      if (lead.speed_to_lead_hours == null) {
        neverContacted.push(lead)
      } else {
        const hasOverdueOrSkipped = lead.follow_up_actions.some(
          (f) => f.status === "OVERDUE" || f.status === "SKIPPED",
        )
        const hasNoFU = lead.follow_up_actions.length === 0
        if (hasOverdueOrSkipped || hasNoFU) {
          followUpGap.push(lead)
        } else {
          engagedLapsed.push(lead)
        }
      }
    }

    const totalMissedValue = sumValue(missedLeads) || 1
    const lossReasons = [
      {
        reason: "Follow-up delay or skip",
        count:  followUpGap.length,
        value:  sumValue(followUpGap),
        pct:    Math.round((sumValue(followUpGap) / totalMissedValue) * 100),
      },
      {
        reason: "Never contacted",
        count:  neverContacted.length,
        value:  sumValue(neverContacted),
        pct:    Math.round((sumValue(neverContacted) / totalMissedValue) * 100),
      },
      {
        reason: "Engaged but went cold",
        count:  engagedLapsed.length,
        value:  sumValue(engagedLapsed),
        pct:    Math.round((sumValue(engagedLapsed) / totalMissedValue) * 100),
      },
    ].sort((a, b) => b.value - a.value)

    // ── Grade breakdown of missed leads ───────────────────────────────────

    const gradeMap: Record<string, { count: number; value: number }> = {}
    for (const l of missedLeads) {
      const g = l.grade as string
      if (!gradeMap[g]) gradeMap[g] = { count: 0, value: 0 }
      gradeMap[g].count++
      gradeMap[g].value += l.expected_value ?? 0
    }
    const gradeMissed = Object.entries(gradeMap)
      .map(([grade, d]) => ({ grade, count: d.count, value: d.value }))
      .sort((a, b) => a.grade.localeCompare(b.grade))

    // ── Speed insight ─────────────────────────────────────────────────────

    const avgSpeedWon    = wonLeadsSpeed._avg.speed_to_lead_hours
    const avgSpeedMissed = missedLeadsSpeed._avg.speed_to_lead_hours

    let speedInsight: string | null = null
    if (avgSpeedWon != null && avgSpeedMissed != null && avgSpeedMissed > 0) {
      const ratio = avgSpeedMissed / Math.max(avgSpeedWon, 0.1)
      if (ratio >= 1.5) {
        speedInsight = `Missed leads were contacted ${ratio.toFixed(1)}× slower than won leads (${avgSpeedMissed.toFixed(1)}h vs ${avgSpeedWon.toFixed(1)}h)`
      } else if (avgSpeedWon < 2) {
        speedInsight = `Won leads were contacted within ${avgSpeedWon.toFixed(1)}h on average — speed is your edge`
      }
    } else if (avgSpeedWon != null && avgSpeedWon < 2) {
      speedInsight = `Won leads were contacted within ${avgSpeedWon.toFixed(1)}h — keep response times fast`
    }

    // ── 7-day trend (by day) ──────────────────────────────────────────────

    const days: { date: string; missed_value: number; missed_count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d    = startOfIstDay(new Date(Date.now() - i * 86_400_000))
      const next = new Date(d.getTime() + 86_400_000)
      const dayLeads = recentMissed.filter(
        (l) => l.missed_at && l.missed_at >= d && l.missed_at < next,
      )
      days.push({
        // label with the IST calendar date, not the UTC date of the boundary
        date:          new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10),
        missed_value:  dayLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0),
        missed_count:  dayLeads.length,
      })
    }

    // Weekly pace: last 7 days total, projected over 7 days
    const weekMissedValue = days.reduce((s, d) => s + d.missed_value, 0)
    const recoveryPotential = overdueLeads.reduce((s, l) => s + (l.lead?.expected_value ?? 0), 0)

    // ── Source performance ─────────────────────────────────────────────────

    const sourcePerf = sources
      .map((src) => {
        const nonJunk   = src.leads.filter((l) => !l.is_junk)
        const wonCount  = nonJunk.filter((l) => l.won_at != null).length
        const missCount = nonJunk.filter((l) => l.is_missed).length
        const avgIntent = nonJunk.length > 0
          ? Math.round(nonJunk.reduce((s, l) => s + l.intent_score, 0) / nonJunk.length)
          : 0
        return {
          id:              src.id,
          name:            src.name,
          total_leads:     nonJunk.length,
          won_count:       wonCount,
          missed_count:    missCount,
          conversion_rate: nonJunk.length > 0 ? Math.round((wonCount  / nonJunk.length) * 100) : 0,
          miss_rate:       nonJunk.length > 0 ? Math.round((missCount / nonJunk.length) * 100) : 0,
          avg_intent:      avgIntent,
        }
      })
      .filter((s) => s.total_leads > 0)
      .sort((a, b) => b.conversion_rate - a.conversion_rate)

    // ── Rep performance ────────────────────────────────────────────────────

    const repPerf = repStats.map((rep) => {
      const leads          = rep.assigned_leads
      const missed         = leads.filter((l) => l.is_missed)
      const won            = leads.filter((l) => l.won_at != null)
      const active         = leads.filter((l) => !l.is_missed && l.won_at == null)
      const speeds         = leads.map((l) => l.speed_to_lead_hours).filter((s): s is number => s != null)
      const avgSpeed       = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null
      const aGradeTotal    = leads.filter((l) => l.grade === "A").length
      const aGradeMissed   = leads.filter((l) => l.grade === "A" && l.is_missed).length
      const aGradeContacted = aGradeTotal - aGradeMissed
      const totalClosed    = won.length + missed.length
      const conversionRate = totalClosed > 0 ? Math.round((won.length / totalClosed) * 100) : null
      return {
        id:               rep.id,
        first_name:       rep.first_name,
        last_name:        rep.last_name,
        assigned:         active.length,
        won_count:        won.length,
        won_value:        won.reduce((s, l) => s + (l.won_value ?? l.expected_value ?? 0), 0),
        missed_count:     missed.length,
        missed_value:     missed.reduce((s, l) => s + (l.expected_value ?? 0), 0),
        speed_to_lead:    avgSpeed,
        a_grade_total:    aGradeTotal,
        a_grade_contacted: aGradeContacted,
        conversion_rate:  conversionRate,
      }
    })

    return apiSuccess({
      loss_reasons:    lossReasons,
      grade_missed:    gradeMissed,
      total_missed_count: missedLeads.length,
      total_missed_value: sumValue(missedLeads),
      patterns: {
        avg_speed_won:    avgSpeedWon,
        avg_speed_missed: avgSpeedMissed,
        speed_insight:    speedInsight,
      },
      prediction: {
        weekly_missed_value: weekMissedValue,
        recovery_potential:  recoveryPotential,
        days,
      },
      source_performance: sourcePerf,
      rep_performance:    repPerf,
      follow_up_configs:  followUpConfigs.map((c) => ({
        grade:             c.grade,
        first_followup_h:  (c.schedule as { first_followup_h: number }).first_followup_h,
        second_followup_h: (c.schedule as { second_followup_h: number }).second_followup_h,
      })),
      won_by_grade: wonByGrade.map((g) => ({
        grade:     g.grade,
        count:     g._count.id,
        avg_speed: g._avg.speed_to_lead_hours,
      })),
      follow_up_gap_value: sumValue(followUpGap),
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Intelligence analytics error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
