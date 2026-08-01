import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { IntakeOutcome, IntakeAbandonReason, type Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

const REASONS = new Set<string>(Object.values(IntakeAbandonReason))

/**
 * PATCH /api/import/session/[id]
 *
 * Advances an intake session through its lifecycle — the Time-to-Trust timeline
 * and the outcome. Fire-and-forget from the client; best-effort.
 *
 * Body: { event, import_job_id?, reason? }
 *   event ∈ viewed | approved | import_started | import_completed
 *         | abandoned | cancelled | failed
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireWorkspace()

    const rl = await rateLimited(`intake-sess:${session.user.id}`, LIMITS.write)
    if (rl) return rl

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const event = typeof body?.event === "string" ? body.event.toLowerCase() : ""

    const now = new Date()
    const data: Prisma.IntakeSessionUpdateInput = {}
    // Only advance report_viewed_at / approved_at on the FIRST occurrence.
    const where: Prisma.IntakeSessionWhereInput = {
      id, account_id: session.account.id, workspace_id: session.workspace.id,
    }

    switch (event) {
      case "viewed":
        data.report_viewed_at = now
        where.report_viewed_at = null
        break
      case "approved":
        data.approved_at = now
        data.outcome = IntakeOutcome.APPROVED
        if (typeof body?.import_job_id === "string") data.import_job_id = body.import_job_id
        break
      case "import_started":
        data.import_started_at = now
        break
      case "import_completed":
        data.import_completed_at = now
        data.outcome = IntakeOutcome.COMPLETED
        break
      case "abandoned":
        data.outcome = IntakeOutcome.ABANDONED
        break
      case "cancelled":
        data.outcome = IntakeOutcome.CANCELLED
        if (typeof body?.reason === "string" && REASONS.has(body.reason.toUpperCase())) {
          data.abandon_reason = body.reason.toUpperCase() as IntakeAbandonReason
        }
        break
      case "failed":
        data.outcome = IntakeOutcome.FAILED
        break
      default:
        return apiError("Unknown intake event", "BAD_REQUEST", 400)
    }

    // Tenant-scoped; updateMany returns count 0 rather than throwing on no match
    // (e.g. a "viewed" that already fired).
    await prisma.intakeSession.updateMany({ where, data })

    return apiSuccess({ updated: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
