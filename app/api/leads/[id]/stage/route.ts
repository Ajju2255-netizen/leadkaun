import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

type Params = { params: { id: string } }

const StageSchema = z.object({
  stage_id: z.string().min(1),
  note:     z.string().optional().nullable(), // required for backward moves (enforced below)
})

/**
 * POST /api/leads/[id]/stage
 * Move a lead to a different pipeline stage.
 * Backward moves (lower display_order) require a note explaining the reason.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`lead-action:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl
    const { data, error } = await parseBody(req, StageSchema)
    if (error) return error

    const [lead, newStage] = await Promise.all([
      prisma.lead.findFirst({
        where: {
          id:         params.id,
          account_id: session.account.id, workspace_id: session.workspace.id,
          ...(session.user.role === "REP"
            ? { assigned_rep_id: session.user.id }
            : {}),
        },
        include: { stage: true },
      }),
      prisma.pipelineStage.findFirst({
        where: { id: data.stage_id, account_id: session.account.id, workspace_id: session.workspace.id },
      }),
    ])

    if (!lead)     return NOT_FOUND("Lead")
    if (!newStage) return apiError("Invalid stage_id", "INVALID_STAGE", 422)

    // Cannot move a terminal (won/lost) lead
    if (lead.stage.is_terminal) {
      return apiError("Cannot move a won or lost lead", "LEAD_IS_TERMINAL", 422)
    }

    // Backward move requires a note
    const isBackward = newStage.display_order < lead.stage.display_order
    if (isBackward && !data.note) {
      return apiError(
        "A note explaining the reason is required for backward stage moves",
        "NOTE_REQUIRED",
        422,
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: params.id },
        data: {
          stage_id:         data.stage_id,
          stage_entered_at: new Date(),
        },
      })

      await tx.stageHistory.create({
        data: {
          lead_id:       params.id,
          from_stage_id: lead.stage_id,
          to_stage_id:   data.stage_id,
          changed_by:    session.user.id,
          note:          data.note ?? null,
        },
      })

      // Add a note entry for backward moves
      if (isBackward && data.note) {
        await tx.leadNote.create({
          data: {
            lead_id: params.id,
            user_id: session.user.id,
            content: `Stage moved back to "${newStage.name}": ${data.note}`,
          },
        })
      }
    })

    return apiSuccess({ moved: true, stage: newStage })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
