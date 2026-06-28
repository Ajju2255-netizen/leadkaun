// Billing reads for Mission Control. Manual entry now (founder sets plan/MRR);
// Payment/Invoice stay empty until a provider is wired. Amounts in paise.

import { prisma } from "@/lib/prisma"

export type Revenue = {
  mrrInr: number
  arrInr: number
  payingCustomers: number
  trials: number
  canceled: number
  conversionPct: number | null
  churnPct: number | null
  planDistribution: { plan: string; count: number }[]
  hasPayments: boolean
  hasInvoices: boolean
}

export async function getRevenue(): Promise<Revenue> {
  const [active, trialing, canceled, mrrAgg, byPlan, plans, payCount, invCount] = await Promise.all([
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "trialing" } }),
    prisma.subscription.count({ where: { status: "canceled" } }),
    prisma.subscription.aggregate({ where: { status: "active" }, _sum: { mrr_inr: true } }),
    prisma.subscription.groupBy({ by: ["plan_id"], where: { status: { in: ["active", "trialing"] } }, _count: { _all: true } }),
    prisma.plan.findMany({ select: { id: true, name: true } }),
    prisma.payment.count(),
    prisma.invoice.count(),
  ])

  const planName = new Map(plans.map((p) => [p.id, p.name]))
  const mrr = mrrAgg._sum.mrr_inr ?? 0
  const everPaid = active + canceled

  return {
    mrrInr: mrr,
    arrInr: mrr * 12,
    payingCustomers: active,
    trials: trialing,
    canceled,
    conversionPct: active + trialing + canceled > 0 ? Math.round((active / (active + trialing + canceled)) * 100) : null,
    churnPct: everPaid > 0 ? Math.round((canceled / everPaid) * 100) : null,
    planDistribution: byPlan.map((r) => ({ plan: planName.get(r.plan_id) ?? "—", count: r._count._all })),
    hasPayments: payCount > 0,
    hasInvoices: invCount > 0,
  }
}

export async function listPlans() {
  return prisma.plan.findMany({ where: { is_active: true }, orderBy: { price_inr: "asc" }, select: { key: true, name: true, price_inr: true } })
}

export type AccountSubscription = { planKey: string; planName: string; status: string; mrrInr: number; trialEndsAt: Date | null } | null

export async function getAccountSubscription(accountId: string): Promise<AccountSubscription> {
  const sub = await prisma.subscription.findUnique({ where: { account_id: accountId }, include: { plan: true } })
  if (!sub) return null
  return { planKey: sub.plan.key, planName: sub.plan.name, status: sub.status, mrrInr: sub.mrr_inr, trialEndsAt: sub.trial_ends_at }
}

// Per-account subscription summary for the Customers list (batched).
export async function getSubscriptionMap(): Promise<Map<string, { planName: string; status: string; mrrInr: number }>> {
  const subs = await prisma.subscription.findMany({ include: { plan: { select: { name: true } } } })
  return new Map(subs.map((s) => [s.account_id, { planName: s.plan.name, status: s.status, mrrInr: s.mrr_inr }]))
}
