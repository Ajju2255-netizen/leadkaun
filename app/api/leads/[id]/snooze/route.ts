import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"

type Params = { params: { id: string } }

const VALID_DURATIONS = ["1_day", "3_days", "1_week", "2_weeks", "1_month"] as const

const SnoozeSchema = z.object({
  duration: z.enum(VALID_DURATIONS),
  reason:   z.string().optional().nullable(),
})

const DURATION_DAYS: Record<typeof VALID_DURATIONS[number], number> = {
  "1_day":    1,
  "3_days":   3,
  "1_week":   7,
  "2_weeks":  14,
  "1_month":  30,
}

/**
 * POST /api/leads/[id]/snooze
 * Snooze a lead — moves it out of the queue until the snooze period expires.
 * Implemented by pushing all PENDING follow-up actions forward by the snooze duration.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, SnoozeSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: {
        id:         params.id,
        account_id: session.account.id,
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
    })
    if (!lead) return NOT_FOUND("Lead")

    const days = DURATION_DAYS[data.duration]
    const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    // Push all pending follow-up actions forward
    await prisma.$transaction(async (tx) => {
      await tx.followUpAction.updateMany({
        where: {
          lead_id: params.id,
          status:  "PENDING",
        },
        data: { due_date: snoozeUntil },
      })

      if (data.reason) {
        await tx.leadNote.create({
          data: {
            lead_id: params.id,
            user_id: session.user.id,
            content: `Snoozed for ${data.duration.replace(/_/g, " ")}${data.reason ? `: ${data.reason}` : ""}`,
          },
        })
      }
    })

    return apiSuccess({ snoozed: true, until: snoozeUntil.toISOString() })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
