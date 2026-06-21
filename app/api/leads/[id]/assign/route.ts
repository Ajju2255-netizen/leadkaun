import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

type Params = { params: { id: string } }

const AssignSchema = z.object({
  rep_id: z.string().min(1),
})

/**
 * POST /api/leads/[id]/assign
 * Assign (or reassign) a lead to a rep. Admin/Manager only.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")

    const _rl = await rateLimited(`lead-action:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl
    const { data, error } = await parseBody(req, AssignSchema)
    if (error) return error

    // Verify lead + target rep both belong to this account
    const [lead, rep] = await Promise.all([
      prisma.lead.findFirst({ where: { id: params.id, account_id: session.account.id, workspace_id: session.workspace.id } }),
      prisma.user.findFirst({
        where: { id: data.rep_id, account_id: session.account.id, is_active: true },
      }),
    ])
    if (!lead) return NOT_FOUND("Lead")
    if (!rep)  return apiError("Rep not found or inactive", "REP_NOT_FOUND", 422)

    await prisma.lead.update({
      where: { id: params.id },
      data: { assigned_rep_id: data.rep_id },
    })

    return apiSuccess({ assigned: true, rep_id: data.rep_id })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
