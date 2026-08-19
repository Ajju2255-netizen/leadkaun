// ─────────────────────────────────────────────
// BUSINESS SCORECARD — the numbers the company runs on (Mission Control)
//
// Everything on one screen, over a chosen date range: who signed up, how many
// users, the account mix by plan, what has actually been collected, and the
// month-by-month trend.
//
// The correction this file exists to make: plan distribution computed from the
// `subscriptions` table alone SILENTLY OMITS every account that has no
// subscription row — which is exactly the free population. Here the mix is
// computed from the account list outward, so `free + trialing + paid` always
// reconciles to the total account count. If it ever doesn't, the numbers are
// wrong and should be treated as such.
//
// Two revenue ideas are kept apart on purpose:
//   · MRR            — a forward-looking rate, from subscriptions.mrr_inr.
//   · Collected      — money that actually arrived, from the payments table.
// They disagree whenever a plan was set manually (no provider behind it), so
// the page reports both and says which is which.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { startOfIstDay, startOfIstMonth } from "@/lib/time/ist"
import { ImportStatus } from "@prisma/client"

const DAY = 86_400_000

/**
 * Plan keys that are genuinely free. Everything else counts as a paid tier —
 * including `enterprise`, whose price_inr is 0 only because it is negotiated
 * per deal rather than listed.
 */
const FREE_PLAN_KEYS = new Set(["trial"])

// ── Period ────────────────────────────────────────────────────────────────────

export type PeriodKey = "today" | "7d" | "30d" | "90d" | "month" | "quarter" | "year" | "all"

export type Period = {
  key: PeriodKey
  label: string
  /** null = all time (no lower bound). */
  since: Date | null
  /** The equally-long window immediately before `since`, for the delta. */
  prevSince: Date | null
  prevUntil: Date | null
}

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
]

export function resolvePeriod(key: string | undefined): Period {
  const now = new Date()
  const k = (PERIOD_OPTIONS.find((o) => o.value === key)?.value ?? "30d") as PeriodKey
  const label = PERIOD_OPTIONS.find((o) => o.value === k)!.label

  const rolling = (days: number): Period => {
    const since = new Date(now.getTime() - days * DAY)
    return { key: k, label, since, prevSince: new Date(since.getTime() - days * DAY), prevUntil: since }
  }

  switch (k) {
    case "today": {
      const since = startOfIstDay(now)
      return { key: k, label, since, prevSince: new Date(since.getTime() - DAY), prevUntil: since }
    }
    case "7d": return rolling(7)
    case "30d": return rolling(30)
    case "90d": return rolling(90)
    case "month": {
      const since = startOfIstMonth(now)
      // Previous calendar month, not a fixed 30 days.
      const prevSince = startOfIstMonth(new Date(since.getTime() - DAY))
      return { key: k, label, since, prevSince, prevUntil: since }
    }
    case "quarter": {
      const m = startOfIstMonth(now)
      const monthIdx = new Date(m.getTime() + 5.5 * 3600_000).getUTCMonth()
      const back = monthIdx % 3
      let since = m
      for (let i = 0; i < back; i++) since = startOfIstMonth(new Date(since.getTime() - DAY))
      let prevSince = since
      for (let i = 0; i < 3; i++) prevSince = startOfIstMonth(new Date(prevSince.getTime() - DAY))
      return { key: k, label, since, prevSince, prevUntil: since }
    }
    case "year": {
      let since = startOfIstMonth(now)
      const monthIdx = new Date(since.getTime() + 5.5 * 3600_000).getUTCMonth()
      for (let i = 0; i < monthIdx; i++) since = startOfIstMonth(new Date(since.getTime() - DAY))
      let prevSince = since
      for (let i = 0; i < 12; i++) prevSince = startOfIstMonth(new Date(prevSince.getTime() - DAY))
      return { key: k, label, since, prevSince, prevUntil: since }
    }
    default:
      return { key: "all", label, since: null, prevSince: null, prevUntil: null }
  }
}

/** Percentage change, or null when there is no comparable prior window. */
function delta(current: number, previous: number | null): number | null {
  if (previous == null) return null
  if (previous === 0) return current === 0 ? 0 : null // "up from zero" is not a percentage
  return Math.round(((current - previous) / previous) * 100)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignupRow = {
  id: string
  name: string
  industry: string
  city: string
  ownerName: string | null
  ownerEmail: string | null
  source: string | null
  planName: string
  isPaid: boolean
  users: number
  leads: number
  activated: boolean
  createdAt: Date
}

export type PlanMixRow = {
  key: string
  name: string
  priceInr: number
  accounts: number
  pctOfAccounts: number
  mrrInr: number
  isPaid: boolean
  note?: string
}

export type MonthPoint = { month: string; label: string; count: number; amountInr: number }

export type BusinessScorecard = {
  period: Period
  signups: { inPeriod: number; prevPeriod: number | null; deltaPct: number | null; total: number }
  /** The actual accounts that signed up in the period, newest first. */
  newSignups: SignupRow[]
  users: {
    total: number
    inPeriod: number
    prevPeriod: number | null
    deltaPct: number | null
    active: number
    invited: number
    deactivated: number
    byRole: { role: string; count: number }[]
    avgPerAccount: number | null
  }
  accountMix: {
    total: number
    free: number
    freeNoSubscription: number
    freeOnTrialPlan: number
    cancelled: number
    trialing: number
    paid: number
    pastDue: number
    freePct: number | null
    paidPct: number | null
    byPlan: PlanMixRow[]
    /** free + trialing + paid + pastDue + cancelled must equal total. */
    reconciles: boolean
  }
  revenue: {
    mrrInr: number
    arrInr: number
    arpaInr: number | null
    payingAccounts: number
    everPaidAccounts: number
    activeButZeroMrr: number
    paymentsInPeriod: number
    collectedInPeriodInr: number
    collectedAllTimeInr: number
    lastPayment: { accountId: string; accountName: string; amountInr: number; status: string; at: Date } | null
    hasPaymentData: boolean
  }
  churn: { cancelledInPeriod: number; cancelledTotal: number; churnPct: number | null }
  trends: { signupsByMonth: MonthPoint[]; revenueByMonth: MonthPoint[]; hasRevenueHistory: boolean }
}

// ── Main read ─────────────────────────────────────────────────────────────────

export async function getBusinessScorecard(periodKey?: string): Promise<BusinessScorecard> {
  const period = resolvePeriod(periodKey)
  const inPeriod = period.since ? { gte: period.since } : undefined
  const inPrev = period.prevSince && period.prevUntil ? { gte: period.prevSince, lt: period.prevUntil } : undefined

  const [
    totalAccounts, signupsInPeriod, signupsPrev,
    totalUsers, usersInPeriod, usersPrev, usersActive, usersInvited, usersDeactivated, usersByRole,
    subs, plans,
    paymentsInPeriodAgg, paymentsAllTimeAgg, everPaid, lastPaymentRow,
    cancelledInPeriod, cancelledTotal,
    signupSeries, revenueSeries,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: inPeriod ? { created_at: inPeriod } : {} }),
    inPrev ? prisma.account.count({ where: { created_at: inPrev } }) : Promise.resolve(null),

    prisma.user.count(),
    prisma.user.count({ where: inPeriod ? { created_at: inPeriod } : {} }),
    inPrev ? prisma.user.count({ where: { created_at: inPrev } }) : Promise.resolve(null),
    prisma.user.count({ where: { is_active: true } }),
    prisma.user.count({ where: { is_active: false, joined_at: null } }),
    prisma.user.count({ where: { is_active: false, joined_at: { not: null } } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),

    prisma.subscription.findMany({
      select: {
        account_id: true, status: true, mrr_inr: true,
        plan: { select: { key: true, name: true, price_inr: true } },
      },
    }),
    prisma.plan.findMany({ orderBy: { price_inr: "asc" }, select: { key: true, name: true, price_inr: true } }),

    prisma.payment.aggregate({
      where: { status: "succeeded", ...(inPeriod ? { created_at: inPeriod } : {}) },
      _count: { _all: true }, _sum: { amount_inr: true },
    }),
    prisma.payment.aggregate({ where: { status: "succeeded" }, _sum: { amount_inr: true } }),
    prisma.payment
      .groupBy({ by: ["account_id"], where: { status: "succeeded" } })
      .then((r) => r.length),
    prisma.payment.findFirst({ orderBy: { created_at: "desc" } }),

    prisma.subscription.count({
      where: { status: "canceled", ...(inPeriod ? { canceled_at: inPeriod } : {}) },
    }),
    prisma.subscription.count({ where: { status: "canceled" } }),

    signupsByMonth(12),
    revenueByMonth(12),
  ])

  // ── Account mix, computed from the account total outward ──
  // `trial` is the ONLY genuinely free tier. Do not infer this from price:
  // `enterprise` is stored at price_inr = 0 because it is negotiated per deal,
  // so a price-based test would file paying enterprise customers under "free".
  const paidPlanKeys = new Set(plans.filter((p) => !FREE_PLAN_KEYS.has(p.key)).map((p) => p.key))

  const freeNoSubscription = totalAccounts - subs.length
  let freeOnTrialPlan = 0
  let cancelled = 0
  let trialing = 0
  let paid = 0
  let pastDue = 0
  let activeButZeroMrr = 0

  const planCounts = new Map<string, { accounts: number; mrrInr: number }>()
  const bump = (key: string, mrr = 0) => {
    const cur = planCounts.get(key) ?? { accounts: 0, mrrInr: 0 }
    cur.accounts++
    cur.mrrInr += mrr
    planCounts.set(key, cur)
  }

  for (const s of subs) {
    const isPaidPlan = paidPlanKeys.has(s.plan.key)
    const mrr = Math.round(s.mrr_inr / 100)
    if (s.status === "canceled") {
      cancelled++
      // A cancelled subscription reverts to Free entitlements — count it there.
      bump("__cancelled__")
    } else if (s.status === "trialing") {
      trialing++
      bump(s.plan.key, 0) // a trial isn't producing MRR yet
    } else if (s.status === "past_due") {
      pastDue++
      bump(s.plan.key, mrr)
    } else if (s.status === "active") {
      if (isPaidPlan) {
        paid++
        if (mrr === 0) activeButZeroMrr++
      } else {
        freeOnTrialPlan++
      }
      bump(s.plan.key, mrr)
    }
  }

  const free = freeNoSubscription + freeOnTrialPlan + cancelled
  const reconciles = free + trialing + paid + pastDue === totalAccounts

  const byPlan: PlanMixRow[] = [
    {
      key: "__none__",
      name: "No subscription row",
      priceInr: 0,
      accounts: freeNoSubscription,
      pctOfAccounts: totalAccounts ? Math.round((freeNoSubscription / totalAccounts) * 100) : 0,
      mrrInr: 0,
      isPaid: false,
      note: "Never had a plan set — falls back to Free limits (1 seat, 100 active leads).",
    },
    ...plans.map((p) => {
      const c = planCounts.get(p.key) ?? { accounts: 0, mrrInr: 0 }
      const isPaid = !FREE_PLAN_KEYS.has(p.key)
      return {
        key: p.key,
        name: p.name,
        priceInr: Math.round(p.price_inr / 100),
        accounts: c.accounts,
        pctOfAccounts: totalAccounts ? Math.round((c.accounts / totalAccounts) * 100) : 0,
        mrrInr: c.mrrInr,
        isPaid,
        // Distinguishes "costs nothing" from "priced per deal".
        note: isPaid && p.price_inr === 0 ? "Negotiated per deal — set the MRR manually on the account." : undefined,
      }
    }),
    {
      key: "__cancelled__",
      name: "Cancelled",
      priceInr: 0,
      accounts: planCounts.get("__cancelled__")?.accounts ?? 0,
      pctOfAccounts: totalAccounts
        ? Math.round(((planCounts.get("__cancelled__")?.accounts ?? 0) / totalAccounts) * 100)
        : 0,
      mrrInr: 0,
      isPaid: false,
      note: "Reverts to Free limits — Scale's seats don't linger after cancelling.",
    },
  ].filter((r) => r.accounts > 0 || r.isPaid)

  const mrrInr = subs
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + Math.round(s.mrr_inr / 100), 0)

  const collectedInPeriodInr = Math.round((paymentsInPeriodAgg._sum.amount_inr ?? 0) / 100)
  const collectedAllTimeInr = Math.round((paymentsAllTimeAgg._sum.amount_inr ?? 0) / 100)

  let lastPayment: BusinessScorecard["revenue"]["lastPayment"] = null
  if (lastPaymentRow) {
    const acct = await prisma.account.findUnique({
      where: { id: lastPaymentRow.account_id }, select: { name: true },
    })
    lastPayment = {
      accountId: lastPaymentRow.account_id,
      accountName: acct?.name ?? "(deleted account)",
      amountInr: Math.round(lastPaymentRow.amount_inr / 100),
      status: lastPaymentRow.status,
      at: lastPaymentRow.created_at,
    }
  }

  const everPaidOrActive = paid + cancelled

  return {
    period,
    signups: {
      inPeriod: signupsInPeriod,
      prevPeriod: signupsPrev,
      deltaPct: delta(signupsInPeriod, signupsPrev),
      total: totalAccounts,
    },
    newSignups: await listNewSignups(period.since),
    users: {
      total: totalUsers,
      inPeriod: usersInPeriod,
      prevPeriod: usersPrev,
      deltaPct: delta(usersInPeriod, usersPrev),
      active: usersActive,
      invited: usersInvited,
      deactivated: usersDeactivated,
      byRole: usersByRole.map((r) => ({ role: r.role, count: r._count._all })).sort((a, b) => b.count - a.count),
      avgPerAccount: totalAccounts > 0 ? Math.round((totalUsers / totalAccounts) * 10) / 10 : null,
    },
    accountMix: {
      total: totalAccounts,
      free, freeNoSubscription, freeOnTrialPlan, cancelled, trialing, paid, pastDue,
      freePct: totalAccounts ? Math.round((free / totalAccounts) * 100) : null,
      paidPct: totalAccounts ? Math.round((paid / totalAccounts) * 100) : null,
      byPlan,
      reconciles,
    },
    revenue: {
      mrrInr,
      arrInr: mrrInr * 12,
      arpaInr: paid > 0 ? Math.round(mrrInr / paid) : null,
      payingAccounts: paid,
      everPaidAccounts: everPaid,
      activeButZeroMrr,
      paymentsInPeriod: paymentsInPeriodAgg._count._all,
      collectedInPeriodInr,
      collectedAllTimeInr,
      lastPayment,
      hasPaymentData: collectedAllTimeInr > 0 || (lastPayment != null),
    },
    churn: {
      cancelledInPeriod,
      cancelledTotal,
      churnPct: everPaidOrActive > 0 ? Math.round((cancelledTotal / everPaidOrActive) * 100) : null,
    },
    trends: {
      signupsByMonth: signupSeries,
      revenueByMonth: revenueSeries,
      hasRevenueHistory: revenueSeries.some((m) => m.amountInr > 0),
    },
  }
}

// ── The list behind "a new signup happened" ───────────────────────────────────

async function listNewSignups(since: Date | null, take = 25): Promise<SignupRow[]> {
  const accounts = await prisma.account.findMany({
    where: since ? { created_at: { gte: since } } : {},
    orderBy: { created_at: "desc" },
    take,
    select: {
      id: true, name: true, industry: true, city: true, created_at: true,
      signup_utm_source: true,
      users: {
        where: { role: "ADMIN" }, orderBy: { created_at: "asc" }, take: 1,
        select: { first_name: true, last_name: true, email: true },
      },
      _count: { select: { users: true } },
    },
  })
  if (accounts.length === 0) return []

  const ids = accounts.map((a) => a.id)
  const [subs, leadCounts, importedSet, actedSet] = await Promise.all([
    prisma.subscription.findMany({
      where: { account_id: { in: ids } },
      select: { account_id: true, status: true, plan: { select: { key: true, name: true, price_inr: true } } },
    }),
    prisma.lead.groupBy({ by: ["account_id"], where: { account_id: { in: ids } }, _count: { _all: true } }),
    prisma.importJobStatus
      .groupBy({ by: ["account_id"], where: { account_id: { in: ids }, status: ImportStatus.COMPLETE } })
      .then((r) => new Set(r.map((x) => x.account_id))),
    prisma.signal
      .groupBy({ by: ["account_id"], where: { account_id: { in: ids }, signal_type: { not: "SOURCE_BASELINE" } } })
      .then((r) => new Set(r.map((x) => x.account_id))),
  ])

  const subMap = new Map(subs.map((s) => [s.account_id, s]))
  const leadMap = new Map(leadCounts.map((r) => [r.account_id, r._count._all]))

  return accounts.map((a) => {
    const sub = subMap.get(a.id)
    const owner = a.users[0]
    // Same rule as the account mix — never price-based, so enterprise counts.
    const isPaid = !!sub && sub.status === "active" && !FREE_PLAN_KEYS.has(sub.plan.key)
    return {
      id: a.id,
      name: a.name,
      industry: a.industry,
      city: a.city,
      ownerName: owner ? `${owner.first_name} ${owner.last_name ?? ""}`.trim() : null,
      ownerEmail: owner?.email ?? null,
      source: a.signup_utm_source,
      planName: sub ? sub.plan.name : "Free (no plan)",
      isPaid,
      users: a._count.users,
      leads: leadMap.get(a.id) ?? 0,
      activated: importedSet.has(a.id) && actedSet.has(a.id),
      createdAt: a.created_at,
    }
  })
}

/** Just the newest signups, for the Overview panel. Ignores any period filter. */
export function getLatestSignups(take = 6): Promise<SignupRow[]> {
  return listNewSignups(null, take)
}

// ── Monthly series ────────────────────────────────────────────────────────────
//
// Grouped in IST so a month boundary matches how the business thinks about it.
// Prisma's groupBy cannot date_trunc, so these are raw queries.

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-")
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })
}

/** Back-fill months with no rows so a gap reads as zero rather than vanishing. */
function fillMonths(rows: { month: string; count: number; amountInr: number }[], months: number): MonthPoint[] {
  const out: MonthPoint[] = []
  const now = new Date()
  const found = new Map(rows.map((r) => [r.month, r]))
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    const hit = found.get(ym)
    out.push({ month: ym, label: monthLabel(ym), count: hit?.count ?? 0, amountInr: hit?.amountInr ?? 0 })
  }
  return out
}

async function signupsByMonth(months: number): Promise<MonthPoint[]> {
  try {
    const rows = await prisma.$queryRaw<{ month: string; c: bigint }[]>`
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
             count(*) AS c
      FROM accounts
      GROUP BY 1 ORDER BY 1`
    return fillMonths(rows.map((r) => ({ month: r.month, count: Number(r.c), amountInr: 0 })), months)
  } catch {
    return fillMonths([], months)
  }
}

async function revenueByMonth(months: number): Promise<MonthPoint[]> {
  try {
    const rows = await prisma.$queryRaw<{ month: string; c: bigint; total: bigint | null }[]>`
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
             count(*) AS c, sum(amount_inr) AS total
      FROM payments
      WHERE status = 'succeeded'
      GROUP BY 1 ORDER BY 1`
    return fillMonths(
      rows.map((r) => ({ month: r.month, count: Number(r.c), amountInr: Math.round(Number(r.total ?? 0) / 100) })),
      months,
    )
  } catch {
    return fillMonths([], months)
  }
}
