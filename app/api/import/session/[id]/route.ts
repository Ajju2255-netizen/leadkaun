import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { IntakeState, IntakeAbandonReason, type Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

const REASONS = new Set<string>(Object.values(IntakeAbandonReason))

/**
 * PATCH /api/import/session/[id]
 *
 * Advances an intake session through its STATE MACHINE and appends an immutable
 * timeline event in the same transaction. This drives Time-to-Trust and gives
 * support a single, faithful record of what happened. Fire-and-forget from the
 * client; best-effort.
 *
 * Body: { event, import_job_id?, reason?, note? }
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
    let state: IntakeState
    let note: string | undefined

    switch (event) {
      case "viewed":
        state = IntakeState.VIEWED
        data.report_viewed_at = now
        break
      case "approved":
        state = IntakeState.APPROVED
        data.approved_at = now
        if (typeof body?.import_job_id === "string") data.import_job_id = body.import_job_id
        break
      case "import_started":
        state = IntakeState.IMPORTING
        data.import_started_at = now
        break
      case "import_completed":
        state = IntakeState.COMPLETED
        data.import_completed_at = now
        break
      case "abandoned":
        state = IntakeState.ABANDONED
        break
      case "cancelled":
        state = IntakeState.CANCELLED
        if (typeof body?.reason === "string" && REASONS.has(body.reason.toUpperCase())) {
          data.abandon_reason = body.reason.toUpperCase() as IntakeAbandonReason
          note = body.reason.toUpperCase()
        }
        break
      case "failed":
        state = IntakeState.FAILED
        if (typeof body?.note === "string") note = body.note.slice(0, 200)
        break
      default:
        return apiError("Unknown intake event", "BAD_REQUEST", 400)
    }
    data.state = state

    // Tenant-scoped fetch first — never touch another workspace's session.
    const found = await prisma.intakeSession.findFirst({
      where: { id, account_id: session.account.id, workspace_id: session.workspace.id },
      select: { id: true, report_viewed_at: true },
    })
    if (!found) return apiError("Intake session not found", "NOT_FOUND", 404)

    // First view only — don't overwrite the timestamp or re-log VIEWED.
    if (event === "viewed" && found.report_viewed_at) {
      return apiSuccess({ updated: false })
    }

    await prisma.$transaction([
      prisma.intakeSession.update({ where: { id: found.id }, data }),
      prisma.intakeSessionEvent.create({
        data: { session_id: found.id, state, ...(note ? { note } : {}) },
      }),
    ])

    return apiSuccess({ updated: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
