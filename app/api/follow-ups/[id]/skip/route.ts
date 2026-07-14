import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * POST /api/follow-ups/[id]/skip
 *
 * Moves a follow-up action's due_date by 24 hours (skip today).
 * Status stays PENDING.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`lead-action:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl
    const { id }  = await params

    const action = await prisma.followUpAction.findFirst({
      where: { id, account_id: session.account.id, workspace_id: session.workspace.id },
    })
    if (!action) return apiError("Follow-up action not found", "NOT_FOUND", 404)

    const isManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"
    if (!isManager && action.assigned_rep_id !== session.user.id) {
      return apiError("You can only skip your own follow-up actions", "FORBIDDEN", 403)
    }

    const newDue = new Date(action.due_date.getTime() + 24 * 60 * 60 * 1000)

    const updated = await prisma.followUpAction.update({
      where: { id },
      data:  { due_date: newDue, status: "PENDING", is_overdue: false },
    })

    return apiSuccess({ action: updated })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
