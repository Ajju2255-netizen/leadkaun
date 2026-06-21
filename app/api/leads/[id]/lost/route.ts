import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

type Params = { params: { id: string } }

const LostSchema = z.object({
  loss_reason: z.enum([
    "PRICE_TOO_HIGH",
    "WENT_COMPETITOR",
    "NO_BUDGET",
    "NO_RESPONSE",
    "REQUIREMENT_CHANGED",
    "WRONG_FIT",
    "OTHER",
  ]),
  note: z.string().optional().nullable(),
})

/**
 * POST /api/leads/[id]/lost
 * Mark a lead as Lost. Requires loss reason.
 * Freezes scores. Writes outcome_snapshot.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`lead-action:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl
    const { data, error } = await parseBody(req, LostSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: {
        id:         params.id,
        account_id: session.account.id, workspace_id: session.workspace.id,
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
      include: { stage: true },
    })
    if (!lead) return NOT_FOUND("Lead")
    if (lead.lost_at) return apiError("Lead is already marked as lost", "ALREADY_LOST", 409)

    const lostStage = await prisma.pipelineStage.findFirst({
      where: { account_id: session.account.id, workspace_id: session.workspace.id, is_lost: true },
    })
    if (!lostStage) return apiError("No Lost stage configured", "NO_LOST_STAGE", 422)

    await prisma.$transaction(async (tx) => {
      const outcome_snapshot = {
        fit_score:     lead.fit_score,
        intent_score:  lead.intent_score,
        quality_score: lead.quality_score,
        grade:         lead.grade,
        stage:         lead.stage.name,
        lost_at:       new Date().toISOString(),
      }

      await tx.lead.update({
        where: { id: params.id },
        data: {
          lost_at:          new Date(),
          loss_reason:      data.loss_reason,
          outcome_snapshot: outcome_snapshot as object,
          stage_id:         lostStage.id,
          stage_entered_at: new Date(),
        },
      })

      await tx.stageHistory.create({
        data: {
          lead_id:       params.id,
          from_stage_id: lead.stage_id,
          to_stage_id:   lostStage.id,
          changed_by:    session.user.id,
          note:          data.note ?? `Lost — ${data.loss_reason.replace(/_/g, " ").toLowerCase()}`,
        },
      })
    })

    return apiSuccess({ lost: true, loss_reason: data.loss_reason })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
