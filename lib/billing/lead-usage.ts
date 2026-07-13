import { prisma } from "@/lib/prisma"

/**
 * Active-lead metering — a soft paywall, not a hard lock.
 *
 * Leadkaun's tiers cap how many ACTIVE leads an account may hold at once: Free
 * 100, Starter 5,000, Growth 25,000, Scale/Enterprise unlimited. An "active"
 * lead is an open one — NOT won, lost, or junked. Closing a deal (won/lost),
 * junking, or deleting a lead frees a slot, so the cap rewards good CRM hygiene
 * and grows with the customer rather than punishing them for using the product.
 *
 * At the cap we do NOT lock the workspace: every existing lead stays fully
 * usable (view/edit/call/close/export). Only ADDING new leads is blocked
 * (see the enforcement in POST /api/leads and the import routes), with an
 * upgrade-or-close-some-deals prompt. A warning banner appears at 80%.
 *
 * Accounts with no subscription (or a canceled one) fall back to the Free limit,
 * the same fail-closed rule seats + entitlements use.
 */

const DEFAULT_PLAN_KEY = "trial" // the "Free" tier
export const WARN_THRESHOLD = 0.8 // show the upgrade banner from 80%

/** Prisma filter for an "active" (open) lead. */
export const ACTIVE_LEAD = {
  won_at: null,
  lost_at: null,
  is_junk: false,
} as const

export type LeadUsage = {
  /** Active (open) leads right now. */
  used: number
  /** null = unlimited (Scale / Enterprise). */
  limit: number | null
  /** null = unlimited. */
  remaining: number | null
  /** 0–100; 0 when unlimited. */
  pct: number
  /** At or over the cap — new leads are blocked (existing stay usable). */
  isOver: boolean
  /** At/above the 80% warning threshold (and not unlimited). */
  nearLimit: boolean
  planName: string
}

export async function getLeadUsage(accountId: string): Promise<LeadUsage> {
  const [used, sub] = await Promise.all([
    prisma.lead.count({ where: { account_id: accountId, ...ACTIVE_LEAD } }),
    prisma.subscription.findUnique({
      where: { account_id: accountId },
      select: { status: true, plan: { select: { name: true, active_lead_limit: true } } },
    }),
  ])

  const plan =
    sub && sub.status !== "canceled"
      ? sub.plan
      : await prisma.plan.findUniqueOrThrow({
          where: { key: DEFAULT_PLAN_KEY },
          select: { name: true, active_lead_limit: true },
        })

  const limit = plan.active_lead_limit // null = unlimited
  const pct = limit == null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  return {
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    pct,
    isOver: limit != null && used >= limit,
    nearLimit: limit != null && used >= Math.floor(limit * WARN_THRESHOLD),
    planName: plan.name,
  }
}

/**
 * How many more active leads may be added right now (Infinity when unlimited).
 * Used by the import path to cap a batch to what's left.
 */
export async function leadsRemaining(accountId: string): Promise<number> {
  const u = await getLeadUsage(accountId)
  return u.remaining == null ? Number.POSITIVE_INFINITY : u.remaining
}
