import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * Permanently delete a customer account and everything under it.
 *
 * There is no undo. Nothing here is reversible and no copy is kept, which is
 * the point: this is the control you reach for when a customer asks to be
 * forgotten, or when a test account has to go.
 *
 * Two things make it more than a one line delete.
 *
 * Almost none of the account relations declare onDelete: Cascade, so Postgres
 * refuses to remove an account while any child row points at it. The order
 * below is therefore load bearing: leaves first, roots last. It was derived
 * from the live foreign key graph rather than from reading the schema by eye.
 *
 * And a second set of tables carry an account_id with no foreign key at all,
 * so the database would happily leave them behind as orphans nobody ever looks
 * at again. Those are listed separately and cleared explicitly.
 *
 * impersonation_logs is deliberately NOT cleared. It also carries an unlinked
 * account_id, and it is the audit trail. Deleting an account must not delete
 * the record of who looked at it.
 */

/** Rows hanging off leads. Cleared before the leads themselves. */
const LEAD_CHILD_TABLES = [
  "follow_up_actions",
  "lead_notes",
  "lead_score_events",
  "recommendation_events",
  "signals",
  "stage_history",
  "win_attributions",
  "notifications",
] as const

/** Rows with a real foreign key to accounts. Cleared before the account. */
const ACCOUNT_CHILD_TABLES = [
  "custom_fields",
  "follow_up_configs",
  "lead_sources",
  "notifications",
  "pipeline_stages",
  "smart_templates",
  "users",
] as const

/** Carry account_id but no foreign key, so nothing would stop them orphaning. */
const UNLINKED_TABLES = [
  "account_events",
  "email_logs",
  "feature_flags",
  "import_job_status",
  "intake_sessions",
  "invoices",
  "job_runs",
  "payments",
  "sheet_syncs",
  "subscriptions",
] as const

export type DeletedAccountSummary = {
  accountId: string
  accountName: string
  userEmails: string[]
  leadCount: number
  authUsersDeleted: number
  authUsersFailed: string[]
}

/**
 * Snapshot of what is about to be destroyed, taken before anything is touched.
 * It is the only description of the account that will still exist afterwards,
 * so it is what the audit record is built from.
 */
export async function describeAccountForDeletion(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      created_at: true,
      users: { select: { id: true, email: true, auth_id: true, role: true } },
      _count: { select: { leads: true, users: true, workspaces: true } },
    },
  })
  return account
}

export async function deleteAccountForever(accountId: string): Promise<DeletedAccountSummary> {
  const account = await describeAccountForDeletion(accountId)
  if (!account) throw new Error("Account not found")

  const summary: DeletedAccountSummary = {
    accountId: account.id,
    accountName: account.name,
    userEmails: account.users.map((u) => u.email),
    leadCount: account._count.leads,
    authUsersDeleted: 0,
    authUsersFailed: [],
  }

  const id = accountId

  await prisma.$transaction(async (tx) => {
    for (const table of LEAD_CHILD_TABLES) {
      await tx.$executeRaw`
        DELETE FROM ${Prisma.raw(`"${table}"`)}
        WHERE lead_id IN (SELECT id FROM leads WHERE account_id = ${id})`
    }
    await tx.$executeRaw`DELETE FROM leads WHERE account_id = ${id}`

    await tx.$executeRaw`
      DELETE FROM workspace_members
      WHERE workspace_id IN (SELECT id FROM workspaces WHERE account_id = ${id})`
    await tx.$executeRaw`DELETE FROM workspaces WHERE account_id = ${id}`

    for (const table of ACCOUNT_CHILD_TABLES) {
      await tx.$executeRaw`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE account_id = ${id}`
    }
    for (const table of UNLINKED_TABLES) {
      await tx.$executeRaw`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE account_id = ${id}`
    }

    await tx.$executeRaw`DELETE FROM accounts WHERE id = ${id}`
  })

  /**
   * Supabase auth users go last, and outside the transaction.
   *
   * They live in a different system, so they cannot be rolled back with the
   * rows above. Doing them last means a failure here leaves an auth user with
   * no account, which signs in and gets bounced straight to logout by the
   * dashboard layout. That is recoverable. The reverse order would delete the
   * login of an account that still exists, which is not.
   */
  try {
    const supabase = createSupabaseAdminClient()
    for (const user of account.users) {
      if (!user.auth_id) continue
      try {
        const { error } = await supabase.auth.admin.deleteUser(user.auth_id)
        if (error) summary.authUsersFailed.push(user.email)
        else summary.authUsersDeleted += 1
      } catch {
        // deleteUser throws rather than returning an error for a malformed id.
        summary.authUsersFailed.push(user.email)
      }
    }
  } catch (e) {
    // Could not even build the client. Everything above is already committed.
    console.error("[delete-account] auth cleanup unavailable:", e)
    summary.authUsersFailed.push(...account.users.map((u) => u.email))
  }

  /**
   * Nothing in this block may throw. The rows are gone and cannot come back, so
   * reporting failure here would tell the operator the deletion did not happen
   * and invite a retry against an account that no longer exists. A login we
   * could not remove is reported in the summary and cleaned up by hand.
   */
  return summary
}
