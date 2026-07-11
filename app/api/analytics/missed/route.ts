import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { requireEntitlement, handleFeatureLock } from "@/lib/billing/entitlements"
import { apiSuccess, apiError } from "@/lib/api/response"
import { startOfIstDay } from "@/lib/time/ist"

/**
 * GET /api/analytics/missed
 *
 * Returns all leads currently marked is_missed=true for the account.
 * Includes per-rep breakdown and total value at risk.
 *
 * Admin/Manager only.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")
    await requireEntitlement(session.account.id, "missed_opportunity")
    const accountId = session.account.id
    const workspaceId = session.workspace.id

    const now    = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // All currently missed leads
    const missedLeads = await prisma.lead.findMany({
      where: {
        account_id: accountId, workspace_id: workspaceId,
        is_missed:  true,
        won_at:     null,
        lost_at:    null,
      },
      select: {
        id:             true,
        first_name:     true,
        last_name:      true,
        company_name:   true,
        city:           true,
        grade:          true,
        expected_value: true,
        missed_at:      true,
        last_action_at: true,
        imported_at:    true,
        assigned_rep:   { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { missed_at: "asc" },   // longest-missed first
    })

    // Value recovered this week: any graded lead won in past 7 days
    // (matches the 4-tier missed-opportunity model — A=24h, B=48h, C=7d, D=30d)
    const recoveredThisWeek = await prisma.lead.aggregate({
      where: {
        account_id: accountId, workspace_id: workspaceId,
        grade:      { in: ["A", "B", "C", "D"] },
        won_at:     { gte: weekAgo },
      },
      _sum: { won_value: true },
    })

    // Enrich with hours_since_missed
    const enriched = missedLeads.map((lead) => ({
      ...lead,
      hours_since_missed: lead.missed_at
        ? Math.floor((now.getTime() - new Date(lead.missed_at).getTime()) / 3_600_000)
        : null,
    }))

    // Group by rep
    type RepEntry = {
      rep_id: string; first_name: string; last_name: string
      missed_count: number; missed_value: number
    }
    const byRepMap = new Map<string, RepEntry>()
    for (const lead of enriched) {
      if (!lead.assigned_rep) continue
      const rep = lead.assigned_rep
      const existing = byRepMap.get(rep.id)
      const value = lead.expected_value ?? 0
      if (existing) {
        existing.missed_count += 1
        existing.missed_value += value
      } else {
        byRepMap.set(rep.id, {
          rep_id:       rep.id,
          first_name:   rep.first_name,
          last_name:    rep.last_name,
          missed_count: 1,
          missed_value: value,
        })
      }
    }

    const totalValue = enriched.reduce((s, l) => s + (l.expected_value ?? 0), 0)

    // ── Yesterday comparison: pool size 24h ago vs now ─────────────────────
    // Pool 24h ago = leads that are still missed AND were already missed 24h ago.
    // (Any lead that became missed in the last 24h was NOT in yesterday's pool.)
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayPool = enriched
      .filter((l) => l.missed_at && new Date(l.missed_at) < dayAgo)
      .reduce((s, l) => s + (l.expected_value ?? 0), 0)
    const value_vs_yesterday_pct =
      yesterdayPool > 0
        ? Math.round(((totalValue - yesterdayPool) / yesterdayPool) * 100)
        : null

    // ── 7-day trend — daily inflow of newly-stale value ────────────────────
    // For each of the last 7 days (oldest → newest), sum value of leads that
    // became missed on that day. Drives the sparkline + 7d % change.
    const trend_7d: number[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfIstDay(new Date(now.getTime() - i * 86_400_000))
      const dayEnd   = new Date(dayStart.getTime() + 86_400_000)
      const dayValue = enriched
        .filter((l) => l.missed_at && new Date(l.missed_at) >= dayStart && new Date(l.missed_at) < dayEnd)
        .reduce((s, l) => s + (l.expected_value ?? 0), 0)
      trend_7d.push(dayValue)
    }

    // 7d % change = pool size change over 7 days.
    // Approximation: pool_7d_ago = pool_now − value of leads that became missed in last 7 days.
    const sevenDaysAgo  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const newInLast7Days = enriched
      .filter((l) => l.missed_at && new Date(l.missed_at) >= sevenDaysAgo)
      .reduce((s, l) => s + (l.expected_value ?? 0), 0)
    const poolSevenDaysAgo = totalValue - newInLast7Days
    const value_7d_pct_change =
      poolSevenDaysAgo > 0
        ? Math.round(((totalValue - poolSevenDaysAgo) / poolSevenDaysAgo) * 100)
        : newInLast7Days > 0
        ? 100  // pool grew from zero — flag a sharp rise
        : null

    return apiSuccess({
      total_count:         enriched.length,
      total_value:         totalValue,
      recovered_this_week: recoveredThisWeek._sum.won_value ?? 0,
      value_vs_yesterday_pct,
      value_7d_pct_change,
      trend_7d,
      leads:               enriched,
      by_rep:              Array.from(byRepMap.values()),
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    const locked = handleFeatureLock(err)
    if (locked) return locked
    console.error("Missed analytics error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
