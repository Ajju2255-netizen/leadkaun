import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * Seat accounting. One definition, used by both the enforcement path
 * (POST /api/team/invite) and the display path (Settings → Billing), so the
 * number a customer sees is the number that blocks them.
 *
 * A seat is OCCUPIED by any user row that is not deactivated:
 *
 *   active member    is_active = true                       → occupies
 *   pending invite   is_active = false, joined_at IS NULL   → occupies (reserved)
 *   deactivated      is_active = false, joined_at IS NOT NULL → free
 *
 * `is_active = false` means two different things in this schema — "invited, has
 * not accepted yet" and "was a member, has been switched off". `joined_at` is
 * the only field that separates them: it is stamped on invite acceptance
 * (app/api/auth/confirm/route.ts) and never cleared.
 *
 * Counting pending invites is deliberate: without it an admin on a 10-seat plan
 * could queue 50 invites and blow past the cap the moment they all accept.
 * Removing a member is a hard delete (app/api/team/members/[id]/route.ts), so
 * the seat comes back immediately.
 *
 * Known edge: a pending invite that is deactivated before ever accepting keeps
 * its seat (is_active=false, joined_at=null). Deleting the member frees it.
 */
export const OCCUPIES_SEAT: Prisma.UserWhereInput = {
  OR: [{ is_active: true }, { is_active: false, joined_at: null }],
}

/** Plan an account falls back to when it has no subscription row yet. */
const DEFAULT_PLAN_KEY = "trial"

export type SeatUsage = {
  used: number
  limit: number
  remaining: number
  isFull: boolean
  planKey: string
  planName: string
}

export function countSeats(accountId: string): Promise<number> {
  return prisma.user.count({ where: { account_id: accountId, ...OCCUPIES_SEAT } })
}

/**
 * Current seat usage against the account's plan limit.
 *
 * Accounts with no subscription row (every account before billing existed) are
 * treated as being on `trial` rather than as having no limit — failing open on
 * seats would make the cap unenforceable for exactly the accounts that never
 * paid.
 */
export async function getSeatUsage(accountId: string): Promise<SeatUsage> {
  const [used, sub] = await Promise.all([
    countSeats(accountId),
    prisma.subscription.findUnique({
      where: { account_id: accountId },
      select: { status: true, plan: { select: { key: true, name: true, max_seats: true } } },
    }),
  ])

  // A cancelled subscription must not keep granting Scale's 50 seats.
  const plan =
    sub && sub.status !== "canceled"
      ? sub.plan
      : await prisma.plan.findUniqueOrThrow({
          where: { key: DEFAULT_PLAN_KEY },
          select: { key: true, name: true, max_seats: true },
        })

  const limit = plan.max_seats
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    isFull: used >= limit,
    planKey: plan.key,
    planName: plan.name,
  }
}

/**
 * Seats an account would need to fit on `planKey`. Used to stop a customer
 * buying a plan smaller than their current team, which would leave them
 * instantly over-limit with no way to invite anyone.
 */
export async function seatsExceedPlan(
  accountId: string,
  planKey: string,
): Promise<{ exceeds: boolean; used: number; limit: number }> {
  const [used, plan] = await Promise.all([
    countSeats(accountId),
    prisma.plan.findUniqueOrThrow({ where: { key: planKey }, select: { max_seats: true } }),
  ])
  return { exceeds: used > plan.max_seats, used, limit: plan.max_seats }
}
