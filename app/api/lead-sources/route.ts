import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/lead-sources
 *
 * Returns all lead sources for the current account.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    const sources = await prisma.leadSource.findMany({
      where:   { account_id: session.account.id },
      orderBy: { name: "asc" },
      select:  { id: true, name: true, key: true, intent_baseline: true, is_custom: true },
    })

    return apiSuccess({ sources })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
