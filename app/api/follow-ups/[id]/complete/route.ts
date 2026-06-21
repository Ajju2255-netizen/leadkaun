import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

/**
 * POST /api/follow-ups/[id]/complete
 *
 * Marks a follow-up action as COMPLETED.
 * Only the assigned rep (or Admin/Manager) may complete it.
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
      return apiError("You can only complete your own follow-up actions", "FORBIDDEN", 403)
    }

    const updated = await prisma.followUpAction.update({
      where: { id },
      data:  { status: "COMPLETED", completed_at: new Date() },
    })

    return apiSuccess({ action: updated })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
