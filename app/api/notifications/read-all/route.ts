import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * POST /api/notifications/read-all
 * Marks all unread notifications as read for the current user.
 */
export async function POST(_req: Request) {
  try {
    const session = await requireAuth()

    const result = await prisma.notification.updateMany({
      where: {
        account_id: session.account.id,
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
