import { Prisma } from "@prisma/client"

/**
 * Soft-delete filter for leads.
 *
 * A platform-admin deletion has to hold everywhere, and leads are queried from
 * 103 call sites outside the admin panel. Patching each one by hand would work
 * until somebody adds the 104th, and the failure mode is silent: a "deleted"
 * lead quietly reappearing in a customer's queue. So the filter lives at the
 * client instead, where the default is safe and forgetting is not possible.
 *
 * Scoped deliberately to `lead` and to reads. Accounts, users and workspaces
 * are already handled at the session boundary (lib/auth/session.ts) — a deleted
 * account or user gets no session at all, so none of their queries ever run.
 * Extending those models here as well would be redundant work on every request.
 *
 * ESCAPE HATCH: if a caller mentions `deleted_at` in its own where clause, the
 * filter steps aside and the caller's intent wins. That is how the admin panel
 * lists deleted leads and how restore finds them again.
 *
 * `findUnique` is not extended — Prisma only accepts unique fields in its where
 * clause, so injecting `deleted_at` there is a runtime error. Fetching one lead
 * by id is a detail view reached from a list that was already filtered.
 */
const READ_OPS = new Set(["findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"])

/** Did the caller already say something about deleted_at? Then leave it alone. */
function mentionsDeletedAt(where: unknown): boolean {
  if (!where || typeof where !== "object") return false
  return JSON.stringify(where).includes("deleted_at")
}

export const softDeleteExtension = Prisma.defineExtension({
  name: "soft-delete-leads",
  query: {
    lead: {
      async $allOperations({ operation, args, query }) {
        if (!READ_OPS.has(operation)) return query(args)
        const a = args as { where?: Record<string, unknown> }
        if (mentionsDeletedAt(a.where)) return query(args)
        return query({ ...args, where: { ...(a.where ?? {}), deleted_at: null } } as typeof args)
      },
    },
  },
})
