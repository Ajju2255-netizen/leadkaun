import { prisma } from "@/lib/prisma"
import { recordAccountEvent } from "@/lib/events/account-events"

/**
 * Record the moment an account becomes activated, once.
 *
 * "Activated" already had exactly one definition, shared by lib/admin/growth.ts
 * and lib/admin/overview.ts: the account completed an import AND logged at least
 * one real rep action — a call, a WhatsApp exchange, an override — deliberately
 * excluding the SOURCE_BASELINE signals that import itself writes.
 *
 * That definition was only ever evaluated at read time, by joining two large
 * tables on every admin page load. It told you an account *was* activated but
 * never *when*, so cohort timing had to be reconstructed from max(firstImport,
 * firstAction) and nothing could react to the event as it happened.
 *
 * This writes it down. Call it after any real rep action; it is idempotent, and
 * best-effort in the same way score events are — activation telemetry must never
 * fail the action that triggered it.
 */
export async function maybeRecordActivation(accountId: string): Promise<void> {
  try {
    const already = await prisma.accountEvent.findFirst({
      where: { account_id: accountId, type: "ACTIVATED" },
      select: { id: true },
    })
    if (already) return

    const [importedCount, actionCount] = await Promise.all([
      prisma.accountEvent.count({
        where: { account_id: accountId, type: "IMPORT_COMPLETED" },
      }),
      prisma.signal.count({
        where: { account_id: accountId, signal_type: { not: "SOURCE_BASELINE" } },
      }),
    ])
    if (importedCount === 0 || actionCount === 0) return

    await recordAccountEvent({
      accountId,
      type: "ACTIVATED",
      summary: "Account activated — imported leads and worked one",
      detail: { rule: "IMPORT_COMPLETED + >=1 non-baseline signal" },
    })
  } catch {
    // Never let activation telemetry break a rep's action.
  }
}
