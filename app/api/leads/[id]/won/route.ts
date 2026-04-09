import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"

type Params = { params: { id: string } }

const WonSchema = z.object({
  won_value:   z.number().int().positive({ message: "Deal value is required and must be a positive number" }),
  win_reason:  z.enum([
    "COMPETITIVE_PRICE",
    "BEST_FIT",
    "REFERRAL_TRUST",
    "FAST_DELIVERY",
    "EXISTING_RELATIONSHIP",
    "OTHER",
  ]),
  note: z.string().optional().nullable(),
})

/**
 * POST /api/leads/[id]/won
 * Mark a lead as Won. Requires deal value + win reason.
 * Freezes scores. Writes outcome_snapshot. Creates WinAttribution for current rep.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, WonSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: {
        id:         params.id,
        account_id: session.account.id,
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
      include: { stage: true },
    })
    if (!lead) return NOT_FOUND("Lead")
    if (lead.won_at) return apiError("Lead is already marked as won", "ALREADY_WON", 409)

    // Find the Won terminal stage for this account
    const wonStage = await prisma.pipelineStage.findFirst({
      where: { account_id: session.account.id, is_won: true },
    })
    if (!wonStage) return apiError("No Won stage configured", "NO_WON_STAGE", 422)

    await prisma.$transaction(async (tx) => {
      const outcome_snapshot = {
        fit_score:     lead.fit_score,
        intent_score:  lead.intent_score,
        quality_score: lead.quality_score,
        grade:         lead.grade,
        stage:         lead.stage.name,
        won_at:        new Date().toISOString(),
      }

      await tx.lead.update({
        where: { id: params.id },
        data: {
          won_at:           new Date(),
          won_value:        data.won_value,
          win_reason:       data.win_reason,
          outcome_snapshot: outcome_snapshot as object,
          stage_id:         wonStage.id,
          stage_entered_at: new Date(),
        },
      })

      await tx.stageHistory.create({
        data: {
          lead_id:       params.id,
          from_stage_id: lead.stage_id,
          to_stage_id:   wonStage.id,
          changed_by:    session.user.id,
          note:          data.note ?? `Won — ${data.win_reason.replace(/_/g, " ").toLowerCase()}`,
        },
      })

      // Win attribution for assigned rep (FULL) and current user if different (CONTRIBUTED)
      if (lead.assigned_rep_id && lead.assigned_rep_id !== session.user.id) {
        await tx.winAttribution.create({
          data: {
            lead_id:          params.id,
            user_id:          lead.assigned_rep_id,
            attribution_type: "FULL",
            won_value:        data.won_value,
          },
        })
        await tx.winAttribution.create({
          data: {
            lead_id:          params.id,
            user_id:          session.user.id,
            attribution_type: "CONTRIBUTED",
            won_value:        data.won_value,
          },
        })
      } else {
        await tx.winAttribution.create({
          data: {
            lead_id:          params.id,
            user_id:          session.user.id,
            attribution_type: "FULL",
            won_value:        data.won_value,
          },
        })
      }
    })

    return apiSuccess({ won: true, won_value: data.won_value })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
