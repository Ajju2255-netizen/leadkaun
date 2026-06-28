import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/notifications
 *
 * Returns the notification feed from the Notification table (last 7 days).
 * Includes notifications addressed to the current user (user_id = userId)
 * and account-wide ones (user_id = null).
 */
export async function GET(_req: Request) {
  try {
    const session   = await requireWorkspace()
    const accountId = session.account.id
    const workspaceId = session.workspace.id
    const since     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const notifications = await prisma.notification.findMany({
      where: {
        account_id: accountId, workspace_id: workspaceId,
        OR: [
          { user_id: null },
          { user_id: session.user.id },
        ],
        created_at:   { gte: since },
        dismissed_at: null,   // dismissed alerts drop out of the feed
      },
      include: {
        lead: {
          select: {
            id:             true,
            first_name:     true,
            last_name:      true,
            grade:          true,
            expected_value: true,
            company_name:   true,
          },
        },
      },
      orderBy: [
        { is_read:    "asc"  },
        { created_at: "desc" },
      ],
      take: 50,
    })

    return apiSuccess({ items: notifications })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
