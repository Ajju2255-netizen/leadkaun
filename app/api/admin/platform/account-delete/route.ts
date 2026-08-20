import { z } from "zod"

import { requirePlatformAdmin } from "@/lib/auth/platform"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { postToSlack } from "@/lib/admin/notify"
import { describeAccountForDeletion, deleteAccountForever } from "@/lib/admin/delete-account"

// Reads the session cookie, so this route is always dynamic.
export const dynamic = "force-dynamic"

const Body = z.object({
  accountId: z.string().min(1),
  /** Must equal the account name exactly. The typed confirmation. */
  confirmName: z.string().min(1),
  reason: z.string().trim().min(4, "A reason is required. It goes in the record.").max(200),
})

/**
 * POST /api/admin/platform/account-delete
 *
 * Permanently delete a customer account. SUPER_ADMIN only, and the only place
 * in the product where this is possible: there is no self serve delete in the
 * customer app, by design.
 *
 * Three things stand between a mis-click and an unrecoverable deletion. The
 * caller must be a SUPER_ADMIN, must type the account name exactly, and must
 * give a reason.
 *
 * The record is written to Slack BEFORE the delete, not after, because the
 * account's own event stream is one of the things being destroyed. Once this
 * returns, the strongest evidence the account ever existed is that message and
 * the server log line beside it. That is a real weakness and it is called out
 * in the response: a durable audit table would need a schema migration, which
 * on this project is a manual production step.
 */
export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin("SUPER_ADMIN")
    const { data, error } = await parseBody(req, Body)
    if (error) return error

    const account = await describeAccountForDeletion(data.accountId)
    if (!account) return apiError("Account not found", "NOT_FOUND", 404)

    // Exact match, deliberately not trimmed into forgiveness beyond the edges.
    if (data.confirmName.trim() !== account.name.trim()) {
      return apiError(
        "The name you typed does not match this account. Nothing was deleted.",
        "CONFIRM_MISMATCH",
        422,
      )
    }

    const preface =
      `🗑️ Account deleted permanently\n` +
      `• Account: ${account.name} (${account.id})\n` +
      `• Users: ${account.users.map((u) => u.email).join(", ") || "none"}\n` +
      `• Leads: ${account._count.leads}, Workspaces: ${account._count.workspaces}\n` +
      `• Created: ${account.created_at.toISOString()}\n` +
      `• Deleted by: ${admin.email}\n` +
      `• Reason: ${data.reason}`

    // Written first: the account event stream is about to stop existing.
    await postToSlack(preface)
    console.warn("[account-delete]", JSON.stringify({
      accountId: account.id,
      accountName: account.name,
      users: account.users.map((u) => u.email),
      leads: account._count.leads,
      by: admin.email,
      reason: data.reason,
      at: new Date().toISOString(),
    }))

    const summary = await deleteAccountForever(data.accountId)

    if (summary.authUsersFailed.length) {
      await postToSlack(
        `⚠️ Account ${summary.accountName} was deleted but these logins could not be removed: ` +
          `${summary.authUsersFailed.join(", ")}. Remove them in Supabase.`,
      )
    }

    return apiSuccess({ ...summary, auditedTo: "slack+logs" })
  } catch (e) {
    // Log before flattening. A destructive path that fails halfway needs the
    // real reason in the server log, not just a generic message to the caller.
    const auth = handleAuthError(e)
    if (auth) return auth
    console.error("[account-delete] failed:", e)
    return apiError("Could not delete the account. Check the server log.", "DELETE_FAILED", 500)
  }
}
