import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/analytics/missed
 *
 * Returns missed opportunity data:
 * - Total value at risk (A/B grade leads not contacted within thresholds)
 * - Recovered value this week (A/B grade leads won in past 7 days)
 * - Per-rep breakdown sorted by missed_value desc
 * - Lead list sorted by hours_overdue desc
 *
 * Admin/Manager only.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")
    const accountId = session.account.id

    const now             = new Date()
    const gradeAThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const gradeBThreshold = new Date(now.getTime() - 72 * 60 * 60 * 1000)
    const weekAgo         = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)

    const selectFields = {
      id: true, first_name: true, last_name: true, company_name: true, grade: true,
      expected_value: true, first_contact_at: true,
      assigned_rep: { select: { id: true, first_name: true, last_name: true } },
    } as const

    // Grade A leads not contacted in 48h
    const gradeALeads = await prisma.lead.findMany({
      where: {
        account_id:       accountId,
        grade:            "A",
        is_junk:          false,
        won_at:           null,
        lost_at:          null,
        first_contact_at: { lt: gradeAThreshold },
      },
      select: selectFields,
    })

    // Grade B leads not contacted in 72h
    const gradeBLeads = await prisma.lead.findMany({
      where: {
        account_id:       accountId,
        grade:            "B",
        is_junk:          false,
        won_at:           null,
        lost_at:          null,
        first_contact_at: { lt: gradeBThreshold },
      },
      select: selectFields,
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

    // Compute hours_overdue for each
    const withOverdue = <T extends { grade: string; first_contact_at: Date | null }>(lead: T) => {
      const threshold = lead.grade === "A" ? gradeAThreshold : gradeBThreshold
      const contactTime = lead.first_contact_at ?? threshold
      const hoursOverdue = (threshold.getTime() - contactTime.getTime()) / (60 * 60 * 1000)
      return { ...lead, hours_overdue: Math.max(0, hoursOverdue) }
    }

    const leadsWithOverdue = [
      ...gradeALeads.map(withOverdue),
      ...gradeBLeads.map(withOverdue),
    ]

    // Group by rep
    type RepEntry = { rep_id: string; first_name: string; last_name: string; missed_count: number; missed_value: number }
    const byRepMap = new Map<string, RepEntry>()
    for (const lead of leadsWithOverdue) {
      if (!lead.assigned_rep) continue
      const rep = lead.assigned_rep
      const existing = byRepMap.get(rep.id)
      const value = lead.expected_value ?? 0
      if (existing) {
        existing.missed_count += 1
        existing.missed_value += value
      } else {
        byRepMap.set(rep.id, {
          rep_id: rep.id,
          first_name: rep.first_name,
          last_name:  rep.last_name,
          missed_count: 1,
          missed_value: value,
        })
      }
    }

    const totalValue = leadsWithOverdue.reduce((s, l) => s + (l.expected_value ?? 0), 0)

    return apiSuccess({
      total_count:          leadsWithOverdue.length,
      total_value:          totalValue,
      recovered_this_week:  recoveredThisWeek._sum.won_value ?? 0,
      leads:                leadsWithOverdue,
      by_rep:               Array.from(byRepMap.values()),
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Missed analytics error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
