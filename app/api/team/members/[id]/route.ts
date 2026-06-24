import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const UpdateSchema = z.object({
  role:               z.enum(["REP", "MANAGER", "ADMIN"]).optional(),
  is_active:          z.boolean().optional(),
  reassign_to_rep_id: z.string().optional(),   // required when deactivating a rep with leads
})

/** True if the account has at least one ACTIVE admin other than `excludeUserId`. */
async function otherActiveAdminExists(accountId: string, excludeUserId: string) {
  const count = await prisma.user.count({
    where: { account_id: accountId, role: "ADMIN", is_active: true, id: { not: excludeUserId } },
  })
  return count > 0
}

/** Count of active leads still assigned to a member (must be reassigned before removal). */
function activeLeadCount(accountId: string, repId: string) {
  return prisma.lead.count({
    where: {
      account_id:      accountId,
      assigned_rep_id: repId,
      won_at:          null,
      lost_at:         null,
      is_junk:         false,
    },
  })
}

/**
 * PATCH /api/team/members/[id]
 *
 * Update a team member's role or active status.
 * When deactivating, `reassign_to_rep_id` must be provided if the member
 * has any assigned active leads. The last active ADMIN cannot be demoted
 * or deactivated.
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

    // Guard the last admin: you may not demote or deactivate the only active admin.
    const demotingAdmin     = member.role === "ADMIN" && data.role !== undefined && data.role !== "ADMIN"
    const deactivatingAdmin = member.role === "ADMIN" && member.is_active && data.is_active === false
    if ((demotingAdmin || deactivatingAdmin) && !(await otherActiveAdminExists(session.account.id, member.id))) {
      return apiError(
        "This is the last active admin. Promote another member to admin first.",
        "LAST_ADMIN",
        409,
      )
    }

    // Deactivation flow
    if (data.is_active === false && member.is_active) {
      const assignedCount = await activeLeadCount(session.account.id, id)

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

/**
 * DELETE /api/team/members/[id]?reassign_to_rep_id=...
 *
 * Permanently removes a team member: revokes their login (Supabase auth) and
 * deletes the user record (workspace memberships cascade away).
 *
 * Safeguards:
 *  - Admin only; you cannot remove yourself.
 *  - The last active admin cannot be removed.
 *  - Active leads must be reassigned first (pass reassign_to_rep_id).
 *  - Members with sales history (lead notes or won-deal attributions) cannot be
 *    hard-deleted — those are required relations. Deactivate them instead.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`team:member:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl
    const { id } = await params

    const member = await prisma.user.findFirst({
      where: { id, account_id: session.account.id },
    })
    if (!member) return apiError("Team member not found", "NOT_FOUND", 404)
    if (member.id === session.user.id) {
      return apiError("You cannot remove your own account", "FORBIDDEN", 403)
    }

    // Never strand the account without an admin.
    if (member.role === "ADMIN" && member.is_active &&
        !(await otherActiveAdminExists(session.account.id, member.id))) {
      return apiError(
        "This is the last active admin. Promote another member to admin first.",
        "LAST_ADMIN",
        409,
      )
    }

    // Sales history relations (lead notes, win attributions) are required FKs —
    // a hard delete would violate them. Refuse and steer the admin to deactivate.
    const [noteCount, winCount] = await Promise.all([
      prisma.leadNote.count({ where: { user_id: id } }),
      prisma.winAttribution.count({ where: { user_id: id } }),
    ])
    if (noteCount > 0 || winCount > 0) {
      return apiError(
        "This member has recorded activity (notes or won deals) and can't be permanently deleted. Deactivate them instead to preserve history.",
        "HAS_HISTORY",
        409,
      )
    }

    // Reassign any active leads before deleting (otherwise they'd be orphaned).
    const reassignToRepId = new URL(req.url).searchParams.get("reassign_to_rep_id")
    const assignedCount = await activeLeadCount(session.account.id, id)
    if (assignedCount > 0) {
      if (!reassignToRepId) {
        return apiError(
          `This rep has ${assignedCount} active leads. Provide reassign_to_rep_id to continue.`,
          "REASSIGNMENT_REQUIRED",
          422,
        )
      }
      const targetRep = await prisma.user.findFirst({
        where: { id: reassignToRepId, account_id: session.account.id, is_active: true },
      })
      if (!targetRep) return apiError("Target rep not found or inactive", "NOT_FOUND", 404)

      await prisma.lead.updateMany({
        where: { account_id: session.account.id, assigned_rep_id: id, won_at: null, lost_at: null },
        data:  { assigned_rep_id: reassignToRepId },
      })
    }

    // Revoke login. Best-effort — the auth user may already be gone for a
    // placeholder invite that was never accepted.
    if (member.auth_id) {
      try {
        const admin = createSupabaseAdminClient()
        await admin.auth.admin.deleteUser(member.auth_id)
      } catch (e) {
        console.warn("[team:remove] could not delete supabase auth user:", String(e))
      }
    }

    await prisma.user.delete({ where: { id } })

    return apiSuccess({ removed: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Member removal error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
