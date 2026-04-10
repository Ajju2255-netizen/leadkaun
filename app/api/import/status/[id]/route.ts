import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/import/status/[id]
 *
 * Returns current status of an import job.
 * Used by useImportStatus hook (2s polling while PENDING/PROCESSING).
 *
 * Access: job must belong to the caller's account.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session  = await requireAuth()
    const { id }   = await params

    const job = await prisma.importJobStatus.findFirst({
      where: { id, account_id: session.account.id },
      select: {
        id:           true,
        status:       true,
        total_rows:   true,
        inserted:     true,
        duplicates:   true,
        errors:       true,
        progress_pct: true,
        error_detail: true,
        completed_at: true,
        created_at:   true,
      },
    })

    if (!job) return apiError("Import job not found", "NOT_FOUND", 404)

    return apiSuccess(job)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
