import { prisma } from "@/lib/prisma"
import { requirePlatformAdmin } from "@/lib/auth/platform"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { recordAccountEvent } from "@/lib/events/account-events"
import { z } from "zod"

// Reads the session cookie, so this route is always dynamic.
export const dynamic = "force-dynamic"

/**
 * Platform-admin soft delete and restore.
 *
 * "Delete from Leadkaun" means the customer loses access and the record leaves
 * every admin list, while the row and all of its children stay in the database.
 * Nothing is destroyed, so an accidental delete costs a click to undo instead of
 * a restore from backup — which is the whole reason this is not a real DELETE.
 *
 * Enforcement lives at two choke points rather than here: lib/auth/session.ts
 * refuses a session to a deleted user or any user of a deleted account, and
 * lib/prisma-soft-delete.ts filters deleted leads out of every product read.
 * This route only sets and clears the timestamp.
 *
 * SUPER_ADMIN only, matching the plan/MRR editor — this removes a paying
 * customer from the product, and it is not a support-tier action.
 */
const Body = z.object({
  entity: z.enum(["account", "user", "workspace", "lead"]),
  id:     z.string().min(1),
  action: z.enum(["delete", "restore"]),
  reason: z.string().max(500).optional(),
})

/** Which account does this record belong to? Needed to write the audit event. */
async function resolveAccountId(entity: string, id: string): Promise<string | null> {
  if (entity === "account") return id
  if (entity === "user") {
    const r = await prisma.user.findUnique({ where: { id }, select: { account_id: true } })
    return r?.account_id ?? null
  }
  if (entity === "workspace") {
    const r = await prisma.workspace.findUnique({ where: { id }, select: { account_id: true } })
    return r?.account_id ?? null
  }
  // Mentions deleted_at so the soft-delete extension steps aside — a restore
  // has to be able to find a lead that is currently deleted.
  const r = await prisma.lead.findFirst({
    where: { id, deleted_at: { not: undefined } },
    select: { account_id: true },
  })
  return r?.account_id ?? null
}

export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin("SUPER_ADMIN")
    const { data, error } = await parseBody(req, Body)
    if (error) return error

    const accountId = await resolveAccountId(data.entity, data.id)
    if (!accountId) return apiError("Record not found", "NOT_FOUND", 404)

    const deleted_at = data.action === "delete" ? new Date() : null

    switch (data.entity) {
      case "account":   await prisma.account.update({ where: { id: data.id }, data: { deleted_at } }); break
      case "user":      await prisma.user.update({ where: { id: data.id }, data: { deleted_at } }); break
      case "workspace": await prisma.workspace.update({ where: { id: data.id }, data: { deleted_at } }); break
      case "lead":      await prisma.lead.update({ where: { id: data.id }, data: { deleted_at } }); break
    }

    // Audited on the account timeline, so a deletion is never anonymous.
    await recordAccountEvent({
      accountId,
      type: data.action === "delete" ? "RECORD_SOFT_DELETED" : "RECORD_RESTORED",
      summary: `${data.entity} ${data.action === "delete" ? "deleted" : "restored"} by platform admin`,
      detail: {
        kind: "soft_delete",
        entity: data.entity,
        entityId: data.id,
        action: data.action,
        by: admin.email,
        reason: data.reason ?? null,
      },
    })

    return apiSuccess({ ok: true, entity: data.entity, id: data.id, deleted: deleted_at !== null })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
