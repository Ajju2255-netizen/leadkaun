import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { removeSampleWorkspace } from "@/lib/workspace/sample"

export const dynamic = "force-dynamic"

/**
 * DELETE /api/workspaces/sample — remove the example-lead workspace.
 *
 * Offered from the sample banner so a user is never stuck with demo data they
 * did not ask to keep. Also called automatically once real leads finish
 * importing. Idempotent: removing nothing is still a success.
 */
export async function DELETE() {
  try {
    const session = await requireAuth()

    const rl = await rateLimited(`sample-remove:${session.user.id}`, LIMITS.write)
    if (rl) return rl

    const removed = await removeSampleWorkspace(session.account.id)
    return apiSuccess({ ok: true, removed })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Sample workspace removal failed:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
