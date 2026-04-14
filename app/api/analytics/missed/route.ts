import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

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
    const session = await requireRole("ADMIN", "MANAGER")
    const accountId = session.account.id

    const now    = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // All currently missed leads
    const missedLeads = await prisma.lead.findMany({
      where: {
        account_id: accountId,
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

    // Value recovered this week: A/B grade leads won in past 7 days
    const recoveredThisWeek = await prisma.lead.aggregate({
      where: {
        account_id: accountId,
        grade:      { in: ["A", "B"] },
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

    return apiSuccess({
      total_count:         enriched.length,
      total_value:         totalValue,
      recovered_this_week: recoveredThisWeek._sum.won_value ?? 0,
      leads:               enriched,
      by_rep:              Array.from(byRepMap.values()),
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    const msg = err instanceof Error ? err.message : String(err)
    console.error("Missed analytics error:", msg)
    return apiError(`Internal server error: ${msg}`, "INTERNAL_ERROR", 500)
  }
}
