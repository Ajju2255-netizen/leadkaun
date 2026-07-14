import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * POST /api/notifications/read-all
 * Marks all unread notifications as read for the current user.
 */
export async function POST(_req: Request) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`notif:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl

    const result = await prisma.notification.updateMany({
      where: {
        account_id: session.account.id, workspace_id: session.workspace.id,
        OR: [
          { user_id: null },
          { user_id: session.user.id },
        ],
        is_read: false,
      },
      data: { is_read: true },
    })

    return apiSuccess({ updated: result.count })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
