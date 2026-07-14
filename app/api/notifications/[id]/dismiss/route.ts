import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

const ALLOWED_REASONS = new Set(["already_handled", "not_relevant", "false_positive"])

/**
 * POST /api/notifications/[id]/dismiss
 * Dismiss an alert (removes it from the feed) and record an optional reason
 * ({ reason }) so we can learn which alerts are noise. Alert feedback — FM-14.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`notif:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl
    const { id } = await params

    const body = await req.json().catch(() => ({}))
    const reason = typeof body?.reason === "string" && ALLOWED_REASONS.has(body.reason) ? body.reason : null

    await prisma.notification.updateMany({
      where: { id, account_id: session.account.id, workspace_id: session.workspace.id },
      data:  { dismissed_at: new Date(), dismiss_reason: reason, is_read: true },
    })

    return apiSuccess({ dismissed: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
