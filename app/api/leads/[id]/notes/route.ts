import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"

type Params = { params: { id: string } }

const NoteSchema = z.object({
  content: z.string().min(1).max(2000),
})

/**
 * POST /api/leads/[id]/notes
 * Add a note to a lead. Notes are immutable once created.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, NoteSchema)
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

    const note = await prisma.leadNote.create({
      data: {
        lead_id: params.id,
        user_id: session.user.id,
        content: data.content,
      },
      include: {
        user: { select: { id: true, first_name: true, last_name: true } },
      },
    })

    return apiSuccess(note, 201)
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
