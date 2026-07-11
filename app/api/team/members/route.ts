import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { getSeatUsage } from "@/lib/billing/seats"

/**
 * GET /api/team/members
 * Returns all users in the account (active + invited), plus current seat usage.
 *
 * Seats ride along here rather than on their own endpoint so the Team page's
 * existing `team-members` query invalidation keeps the counter honest after an
 * invite, deactivation, or removal — one cache, no drift.
 *
 * Admin/Manager only.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")

    const [members, seats] = await Promise.all([
      prisma.user.findMany({
        where:   { account_id: session.account.id },
        select: {
          id:         true,
          email:      true,
          first_name: true,
          last_name:  true,
          role:       true,
          is_active:  true,
          invited_at: true,
          _count: {
            // Active leads only — matches the reassignment gate in the member
            // PATCH/DELETE routes so the UI count and server logic agree.
            select: { assigned_leads: { where: { won_at: null, lost_at: null, is_junk: false } } },
          },
        },
        orderBy: [{ role: "asc" }, { first_name: "asc" }],
      }),
      getSeatUsage(session.account.id),
    ])

    return apiSuccess({ members, seats })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
