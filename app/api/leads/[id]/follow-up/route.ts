import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"

type Params = { params: { id: string } }

const ScheduleSchema = z.object({
  due_date:    z.string().datetime(),
  action_type: z.enum(["CALL", "WHATSAPP"]),
  note:        z.string().max(500).optional(),
})

/**
 * POST /api/leads/[id]/follow-up
 * Proactively schedule a follow-up action for a lead.
 * Cancels any existing PENDING follow-ups before creating the new one.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, ScheduleSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: { id: params.id, account_id: session.account.id },
    })
    if (!lead) return NOT_FOUND("Lead")

    const repId = lead.assigned_rep_id ?? session.user.id

    await prisma.$transaction(async (tx) => {
      // Cancel existing pending follow-ups
      await tx.followUpAction.updateMany({
        where: { lead_id: lead.id, status: "PENDING" },
        data:  { status: "SKIPPED" },
      })

      await tx.followUpAction.create({
        data: {
          account_id:      session.account.id,
          lead_id:         lead.id,
          assigned_rep_id: repId,
          day_number:      1,
          action_type:     data.action_type,
          due_date:        new Date(data.due_date),
          status:          "PENDING",
          show_tip:        !!data.note,
          tip_text:        data.note ?? null,
        },
      })
    })

    return apiSuccess({ ok: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
