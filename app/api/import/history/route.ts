import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/import/history
 *
 * Returns the last 50 import jobs for the current account, most recent first.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    const jobs = await prisma.importJobStatus.findMany({
      where:   { account_id: session.account.id },
      orderBy: { created_at: "desc" },
      take:    50,
      select: {
        id:           true,
        status:       true,
        total_rows:   true,
        inserted:     true,
        duplicates:   true,
        errors:       true,
        progress_pct: true,
        error_detail: true,
        created_at:   true,
        completed_at: true,
      },
    })

    return apiSuccess({ jobs })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
