import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/notifications/count
 * Lightweight endpoint for the sidebar bell badge.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireWorkspace()

    const count = await prisma.notification.count({
      where: {
        account_id: session.account.id, workspace_id: session.workspace.id,
        OR: [
          { user_id: null },
          { user_id: session.user.id },
        ],
        is_read:      false,
        dismissed_at: null,
      },
    })

    return apiSuccess({ count })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
