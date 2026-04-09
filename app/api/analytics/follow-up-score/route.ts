import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/analytics/follow-up-score
 *
 * Returns the follow-up completion rate for a rep (or the whole team).
 * FU% = completed_this_week / (completed + overdue_this_week) × 100
 *
 * Query: ?rep_id=xxx (Admin/Manager only for other reps)
 */
export async function GET(req: Request) {
  try {
    const session  = await requireAuth()
    const { searchParams } = new URL(req.url)
    const repId    = searchParams.get("rep_id")

    const isManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"
    const targetId  = isManager && repId ? repId : session.user.id

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [completed, overdue, pending] = await Promise.all([
      prisma.followUpAction.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          status:          "COMPLETED",
          completed_at:    { gte: weekAgo },
        },
      }),
      prisma.followUpAction.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          status:          "OVERDUE",
        },
      }),
      prisma.followUpAction.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          status:          "PENDING",
        },
      }),
    ])

    const total = completed + overdue
    const fuPct = total > 0 ? Math.round((completed / total) * 100) : 100

    return apiSuccess({ completed, overdue, pending, fu_pct: fuPct, rep_id: targetId })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
