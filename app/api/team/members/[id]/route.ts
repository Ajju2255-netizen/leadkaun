import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

const UpdateSchema = z.object({
  role:               z.enum(["REP", "MANAGER"]).optional(),
  is_active:          z.boolean().optional(),
  reassign_to_rep_id: z.string().optional(),   // required when deactivating a rep with leads
})

/**
 * PATCH /api/team/members/[id]
 *
 * Update a team member's role or active status.
 * When deactivating, `reassign_to_rep_id` must be provided if the member
 * has any assigned active leads.
 *
 * Admin only.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`team:member:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl
    const { id }  = await params

    const { data, error } = await parseBody(req, UpdateSchema)
    if (error) return error

    const member = await prisma.user.findFirst({
      where: { id, account_id: session.account.id },
    })
    if (!member) return apiError("Team member not found", "NOT_FOUND", 404)
    if (member.id === session.user.id) {
      return apiError("You cannot modify your own account settings", "FORBIDDEN", 403)
    }

    // Deactivation flow
    if (data.is_active === false && member.is_active) {
      const assignedCount = await prisma.lead.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: id,
          won_at:          null,
          lost_at:         null,
          is_junk:         false,
        },
      })

      if (assignedCount > 0 && !data.reassign_to_rep_id) {
        return apiError(
          `This rep has ${assignedCount} active leads. Provide reassign_to_rep_id to continue.`,
          "REASSIGNMENT_REQUIRED",
          422,
        )
      }

      // Bulk reassign if needed
      if (assignedCount > 0 && data.reassign_to_rep_id) {
        const targetRep = await prisma.user.findFirst({
          where: { id: data.reassign_to_rep_id, account_id: session.account.id, is_active: true },
        })
        if (!targetRep) return apiError("Target rep not found or inactive", "NOT_FOUND", 404)

        await prisma.lead.updateMany({
          where: { account_id: session.account.id, assigned_rep_id: id, won_at: null, lost_at: null },
          data:  { assigned_rep_id: data.reassign_to_rep_id },
        })
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.role      !== undefined ? { role:      data.role      } : {}),
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
      },
      select: { id: true, email: true, first_name: true, last_name: true, role: true, is_active: true },
    })

    return apiSuccess({ member: updated })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
