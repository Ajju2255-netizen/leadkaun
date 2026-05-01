import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"

type Params = { params: { id: string } }

const SourceSchema = z.object({
  source_id: z.string().min(1),
})

/**
 * POST /api/leads/[id]/source
 * Update the lead source. Any role that can see the lead can reassign its source.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, SourceSchema)
    if (error) return error

    const [lead, newSource] = await Promise.all([
      prisma.lead.findFirst({
        where: {
          id:         params.id,
          account_id: session.account.id,
          ...(session.user.role === "REP" ? { assigned_rep_id: session.user.id } : {}),
        },
      }),
      prisma.leadSource.findFirst({
        where: { id: data.source_id, account_id: session.account.id },
        select: { id: true, name: true, key: true },
      }),
    ])

    if (!lead)      return NOT_FOUND("Lead")
    if (!newSource) return apiError("Invalid source_id", "INVALID_SOURCE", 422)

    await prisma.lead.update({
      where: { id: params.id },
      data:  { source_id: data.source_id },
    })

    return apiSuccess({ updated: true, source: newSource })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
