import { prisma } from "@/lib/prisma"
import { startOfIstMonth } from "@/lib/time/ist"

/**
 * Monthly lead metering. Leadkaun's paid tiers cap how many leads an account may
 * ADD per calendar month (IST): Free 100, Starter 5,000, Growth 25,000,
 * Scale/Enterprise unlimited. This is a hard cap enforced on manual create and
 * CSV import — the natural upgrade trigger.
 *
 * "Added this month" = leads whose `imported_at` (set on both manual create and
 * import) falls on or after the 1st of the current IST month, across the whole
 * account (all workspaces — the limit is per-account, like the plan).
 *
 * Accounts with no subscription (or a canceled one) fall back to the Free limit,
 * the same fail-closed rule seats + entitlements use.
 */

const DEFAULT_PLAN_KEY = "trial" // the "Free" tier

export type LeadUsage = {
  used: number
  /** null = unlimited (Scale / Enterprise). */
  limit: number | null
  /** null = unlimited. */
  remaining: number | null
  isOver: boolean
  planName: string
}

export async function getLeadUsage(accountId: string, now: Date = new Date()): Promise<LeadUsage> {
  const monthStart = startOfIstMonth(now)

  const [used, sub] = await Promise.all([
    prisma.lead.count({ where: { account_id: accountId, imported_at: { gte: monthStart } } }),
    prisma.subscription.findUnique({
      where: { account_id: accountId },
      select: { status: true, plan: { select: { name: true, monthly_lead_limit: true } } },
    }),
  ])

  const plan =
    sub && sub.status !== "canceled"
      ? sub.plan
      : await prisma.plan.findUniqueOrThrow({
          where: { key: DEFAULT_PLAN_KEY },
          select: { name: true, monthly_lead_limit: true },
        })

  const limit = plan.monthly_lead_limit // null = unlimited
  return {
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    isOver: limit != null && used >= limit,
    planName: plan.name,
  }
}

/**
 * How many more leads may be added right now (Infinity when unlimited). Cheap
 * helper for the import path, which caps a batch to what's left.
 */
export async function leadsRemaining(accountId: string, now: Date = new Date()): Promise<number> {
  const u = await getLeadUsage(accountId, now)
  return u.remaining == null ? Number.POSITIVE_INFINITY : u.remaining
}
