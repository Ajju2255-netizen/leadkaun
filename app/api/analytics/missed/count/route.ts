import { prisma } from "@/lib/prisma"
import { requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/analytics/missed/count
 *
 * Lightweight endpoint for sidebar badge.
 * Returns the count and total ₹ value of currently missed leads.
 *
 * Admin/Manager only.
 */
export async function GET(_req: Request) {
  try {
    const session   = await requireRole("ADMIN", "MANAGER")
    const accountId = session.account.id

    const [count, value] = await Promise.all([
      prisma.lead.count({
        where: { account_id: accountId, is_missed: true, won_at: null, lost_at: null },
      }),
      prisma.lead.aggregate({
        where: { account_id: accountId, is_missed: true, won_at: null, lost_at: null },
        _sum: { expected_value: true },
      }),
    ])

    return apiSuccess({
      count,
      total_value: value._sum.expected_value ?? 0,
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
