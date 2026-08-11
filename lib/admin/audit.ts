// ─────────────────────────────────────────────
// AUDIT LOG (Mission Control)
//
// A unified, read-only view over the three places sensitive actions are already
// recorded — there is no separate admin_audit table, and deliberately so: an
// audit log that duplicates its sources can disagree with them.
//
//   · impersonation_logs — every "Login as customer", with the reason and IP,
//     written BEFORE the magic link is minted, plus when the session ended.
//   · account_events     — PLAN_CHANGED, FEATURE_FLAG_CHANGED, IMPERSONATED
//     and the customer-side lifecycle events that give an action context.
//   · feature_flags      — current state + which admin last wrote it.
//
// What this cannot show, and says so on the page: field-level before/after
// diffs. The event `detail` JSON holds the new value, not the old one.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import type { AccountEventType, Prisma } from "@prisma/client"

/** Event types produced by a platform admin rather than by the customer. */
export const ADMIN_EVENT_TYPES: AccountEventType[] = ["PLAN_CHANGED", "FEATURE_FLAG_CHANGED", "IMPERSONATED"]

export type AuditKind = "impersonation" | "plan" | "flag" | "lifecycle" | "billing"

export type AuditEntry = {
  id: string
  at: Date
  kind: AuditKind
  /** Who did it. Null when the actor genuinely isn't recorded. */
  actor: string | null
  action: string
  accountId: string
  accountName: string
  detail: string | null
  /** Structured payload as stored, for the expandable raw view. */
  raw: Prisma.JsonValue | null
  ip: string | null
  /** For impersonation: still open, or when it ended. */
  endedAt: Date | null
  sensitive: boolean
}

export type AuditFilters = {
  kind?: AuditKind
  accountId?: string
  days?: number
  take?: number
}

const LIFECYCLE_LABEL: Record<string, string> = {
  SIGNUP: "Account created",
  ICP_CONFIGURED: "ICP configured",
  WORKSPACE_CREATED: "Workspace created",
  WORKSPACE_ARCHIVED: "Workspace archived",
  USER_INVITED: "User invited",
  USER_JOINED: "User accepted invite",
  USER_DEACTIVATED: "User deactivated",
  IMPORT_COMPLETED: "Import completed",
  IMPORT_FAILED: "Import failed",
  TRIAL_STARTED: "Trial started",
  TRIAL_ENDED: "Trial ended",
  PAYMENT_SUCCEEDED: "Payment succeeded",
  PAYMENT_FAILED: "Payment failed",
  PLAN_CHANGED: "Plan changed",
  FEATURE_FLAG_CHANGED: "Feature flag changed",
  IMPERSONATED: "Impersonation started",
}

function kindOf(type: AccountEventType): AuditKind {
  if (type === "PLAN_CHANGED") return "plan"
  if (type === "FEATURE_FLAG_CHANGED") return "flag"
  if (type === "IMPERSONATED") return "impersonation"
  if (type === "PAYMENT_SUCCEEDED" || type === "PAYMENT_FAILED" || type === "TRIAL_STARTED" || type === "TRIAL_ENDED") return "billing"
  return "lifecycle"
}

export async function getAuditLog(f: AuditFilters = {}): Promise<{ entries: AuditEntry[]; counts: Record<AuditKind, number> }> {
  const days = f.days ?? 90
  const since = new Date(Date.now() - days * 86_400_000)
  const take = Math.min(500, f.take ?? 200)

  const eventWhere: Prisma.AccountEventWhereInput = { created_at: { gte: since } }
  if (f.accountId) eventWhere.account_id = f.accountId

  const impWhere: Prisma.ImpersonationLogWhereInput = { started_at: { gte: since } }
  if (f.accountId) impWhere.account_id = f.accountId

  const [events, impersonations, actorUsers] = await Promise.all([
    prisma.accountEvent.findMany({ where: eventWhere, orderBy: { created_at: "desc" }, take }),
    prisma.impersonationLog.findMany({ where: impWhere, orderBy: { started_at: "desc" }, take }),
    prisma.user.findMany({ select: { id: true, first_name: true, last_name: true, email: true } }),
  ])

  const userName = new Map(actorUsers.map((u) => [u.id, `${u.first_name} ${u.last_name ?? ""}`.trim() || u.email]))

  const accountIds = Array.from(new Set([
    ...events.map((e) => e.account_id),
    ...impersonations.map((i) => i.account_id),
  ]))
  const names = new Map(
    (await prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } }))
      .map((a) => [a.id, a.name]),
  )
  const nameOf = (id: string) => names.get(id) ?? "(deleted account)"

  // The IMPERSONATED account_event duplicates the impersonation_log row, and the
  // log row is richer (reason, IP, ended_at). Keep the log, drop the event.
  const entries: AuditEntry[] = [
    ...impersonations.map((i) => ({
      id: `imp_${i.id}`,
      at: i.started_at,
      kind: "impersonation" as const,
      actor: i.admin_email,
      action: "Logged in as customer",
      accountId: i.account_id,
      accountName: nameOf(i.account_id),
      detail: i.reason ?? "no reason recorded",
      raw: null,
      ip: i.ip,
      endedAt: i.ended_at,
      sensitive: true,
    })),
    ...events
      .filter((e) => e.type !== "IMPERSONATED")
      .map((e) => ({
        id: `ev_${e.id}`,
        at: e.created_at,
        kind: kindOf(e.type),
        // account_events records the platform admin's email inside `summary`
        // (the writer has no admin user row to point actor_user_id at).
        actor: e.actor_user_id ? userName.get(e.actor_user_id) ?? null : null,
        action: LIFECYCLE_LABEL[e.type] ?? e.type,
        accountId: e.account_id,
        accountName: nameOf(e.account_id),
        detail: e.summary,
        raw: e.detail,
        ip: null,
        endedAt: null,
        sensitive: ADMIN_EVENT_TYPES.includes(e.type),
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())

  const filtered = f.kind ? entries.filter((e) => e.kind === f.kind) : entries

  const counts = entries.reduce(
    (acc, e) => { acc[e.kind] = (acc[e.kind] ?? 0) + 1; return acc },
    { impersonation: 0, plan: 0, flag: 0, lifecycle: 0, billing: 0 } as Record<AuditKind, number>,
  )

  return { entries: filtered.slice(0, take), counts }
}

export type OpenImpersonation = {
  id: string
  adminEmail: string
  accountId: string
  accountName: string
  reason: string | null
  startedAt: Date
  ip: string | null
  /** Older than the 1-hour marker lifetime — almost certainly a stale row. */
  likelyStale: boolean
}

/** Impersonation sessions never explicitly exited. Worth watching. */
export async function getOpenImpersonations(): Promise<OpenImpersonation[]> {
  const rows = await prisma.impersonationLog.findMany({
    where: { ended_at: null },
    orderBy: { started_at: "desc" },
    take: 50,
  })
  if (rows.length === 0) return []

  const names = new Map(
    (await prisma.account.findMany({
      where: { id: { in: Array.from(new Set(rows.map((r) => r.account_id))) } },
      select: { id: true, name: true },
    })).map((a) => [a.id, a.name]),
  )

  const hourAgo = Date.now() - 60 * 60 * 1000
  return rows.map((r) => ({
    id: r.id,
    adminEmail: r.admin_email,
    accountId: r.account_id,
    accountName: names.get(r.account_id) ?? "(deleted account)",
    reason: r.reason,
    startedAt: r.started_at,
    ip: r.ip,
    likelyStale: r.started_at.getTime() < hourAgo,
  }))
}

export type FlagState = {
  accountId: string
  accountName: string
  flags: Record<string, boolean>
  lastChangedBy: string | null
  lastChangedAt: Date | null
}

/** Cross-account feature-flag matrix. A missing row means the default (ON). */
export async function getFlagMatrix(): Promise<{ rows: FlagState[]; overriddenAccounts: number }> {
  const [flags, accounts, admins] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.platformAdmin.findMany({ select: { auth_id: true, email: true } }),
  ])
  const adminEmail = new Map(admins.map((a) => [a.auth_id, a.email]))

  const byAccount = new Map<string, { flags: Record<string, boolean>; by: string | null; at: Date | null }>()
  for (const f of flags) {
    const cur = byAccount.get(f.account_id) ?? { flags: {}, by: null, at: null }
    cur.flags[f.key] = f.enabled
    if (!cur.at || f.updated_at > cur.at) {
      cur.at = f.updated_at
      cur.by = f.updated_by ? adminEmail.get(f.updated_by) ?? f.updated_by : null
    }
    byAccount.set(f.account_id, cur)
  }

  return {
    rows: accounts.map((a) => {
      const e = byAccount.get(a.id)
      return {
        accountId: a.id,
        accountName: a.name,
        flags: e?.flags ?? {},
        lastChangedBy: e?.by ?? null,
        lastChangedAt: e?.at ?? null,
      }
    }),
    overriddenAccounts: byAccount.size,
  }
}
