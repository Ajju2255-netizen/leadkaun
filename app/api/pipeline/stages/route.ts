import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/pipeline/stages
 *
 * Returns all pipeline stages for the current account, ordered by display_order.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    const stages = await prisma.pipelineStage.findMany({
      where:   { account_id: session.account.id },
      orderBy: { display_order: "asc" },
      select:  { id: true, name: true, key: true, display_order: true, is_terminal: true, is_won: true, is_lost: true },
    })

    // Expose display_order as "order" to match the shape the pipeline page expects
    const shaped = stages.map((s) => ({ ...s, order: s.display_order }))

    return apiSuccess({ stages: shaped })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
