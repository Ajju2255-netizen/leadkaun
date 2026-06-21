import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

/**
 * POST /api/notifications/[id]/read
 * Marks a single notification as read.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`notif:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl
    const { id }  = await params

    await prisma.notification.updateMany({
      where: { id, account_id: session.account.id, workspace_id: session.workspace.id },
      data:  { is_read: true },
    })

    return apiSuccess({})
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
