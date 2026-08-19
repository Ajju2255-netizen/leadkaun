// ─────────────────────────────────────────────
// BILLING — subscriptions + usage against plan limits (Mission Control)
//
// Two screens' worth of reads. Everything derives from `plans` (the caps live
// there, not on the subscription, so a plan change applies to every subscriber
// with no backfill) and mirrors the fail-closed fallback the enforcement code
// uses: no subscription, or a cancelled one, means the Free tier's caps.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { ACTIVE_LEAD } from "@/lib/billing/lead-usage"
import { OCCUPIES_SEAT } from "@/lib/billing/seats"
import type { Prisma } from "@prisma/client"

export type SubscriptionRow = {
  accountId: string
  accountName: string
  planKey: string
  planName: string
  status: string
  mrrInr: number
  provider: string | null
  providerSubId: string | null
  billingCycle: string | null
  trialEndsAt: Date | null
  periodEnd: Date | null
  cardLabel: string | null
  startedAt: Date
  canceledAt: Date | null
}

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const subs = await prisma.subscription.findMany({
    include: { plan: { select: { key: true, name: true } } },
    orderBy: { mrr_inr: "desc" },
  })
  if (subs.length === 0) return []

  const names = new Map(
    (await prisma.account.findMany({
      where: { id: { in: subs.map((s) => s.account_id) } },
      select: { id: true, name: true },
    })).map((a) => [a.id, a.name]),
  )

  return subs.map((s) => ({
    accountId: s.account_id,
    accountName: names.get(s.account_id) ?? "(deleted account)",
    planKey: s.plan.key,
    planName: s.plan.name,
    status: s.status,
    mrrInr: Math.round(s.mrr_inr / 100),
    provider: s.provider,
    providerSubId: s.provider_subscription_id,
    billingCycle: s.billing_cycle,
    trialEndsAt: s.trial_ends_at,
    periodEnd: s.current_period_end,
    cardLabel: s.card_network && s.card_last4 ? `${s.card_network} •••• ${s.card_last4}` : null,
    startedAt: s.started_at,
    canceledAt: s.canceled_at,
  }))
}

export type PlanRow = {
  key: string
  name: string
  priceInr: number
  maxSeats: number
  activeLeadLimit: number | null
  sellable: boolean
  subscribers: number
  mrrInr: number
}

export async function listPlansWithUptake(): Promise<PlanRow[]> {
  const [plans, byPlan] = await Promise.all([
    prisma.plan.findMany({ orderBy: { price_inr: "asc" } }),
    prisma.subscription.groupBy({
      by: ["plan_id"], where: { status: { in: ["active", "trialing", "past_due"] } },
      _count: { _all: true }, _sum: { mrr_inr: true },
    }),
  ])
  const uptake = new Map(byPlan.map((r) => [r.plan_id, r]))

  return plans.map((p) => {
    const u = uptake.get(p.id)
    return {
      key: p.key,
      name: p.name,
      priceInr: Math.round(p.price_inr / 100),
      maxSeats: p.max_seats,
      activeLeadLimit: p.active_lead_limit,
      // Not sellable online until razorpay-sync-plans.ts has created the entity.
      sellable: !!p.provider_plan_id,
      subscribers: u?._count._all ?? 0,
      mrrInr: Math.round((u?._sum.mrr_inr ?? 0) / 100),
    }
  })
}

export type UsageRow = {
  accountId: string
  accountName: string
  planName: string
  seatsUsed: number
  seatsLimit: number
  seatsPct: number
  leadsUsed: number
  leadsLimit: number | null
  leadsPct: number
  leadsOver: boolean
  monthlyImported: number
  status: "ok" | "warning" | "blocked"
}

/** Every account's seat + active-lead usage against the caps actually enforced. */
export async function getUsageTable(): Promise<{ rows: UsageRow[]; blocked: number; warning: number }> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const [accounts, seatsBy, leadsBy, importedBy, subs, trialPlan] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.user.groupBy({ by: ["account_id"], where: OCCUPIES_SEAT, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["account_id"], where: ACTIVE_LEAD, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["account_id"], where: { imported_at: { gte: monthStart } }, _count: { _all: true } }),
    prisma.subscription.findMany({
      select: { account_id: true, status: true, plan: { select: { name: true, max_seats: true, active_lead_limit: true } } },
    }),
    prisma.plan.findUnique({ where: { key: "trial" }, select: { name: true, max_seats: true, active_lead_limit: true } }),
  ])

  const seats = new Map(seatsBy.map((r) => [r.account_id, r._count._all]))
  const leads = new Map(leadsBy.map((r) => [r.account_id, r._count._all]))
  const imported = new Map(importedBy.map((r) => [r.account_id, r._count._all]))
  const subMap = new Map(subs.map((s) => [s.account_id, s]))
  const fallback = trialPlan ?? { name: "Free", max_seats: 1, active_lead_limit: 100 }

  const rows: UsageRow[] = accounts.map((a) => {
    const sub = subMap.get(a.id)
    const plan = sub && sub.status !== "canceled" ? sub.plan : fallback
    const seatsUsed = seats.get(a.id) ?? 0
    const leadsUsed = leads.get(a.id) ?? 0
    const leadsLimit = plan.active_lead_limit
    const leadsPct = leadsLimit == null || leadsLimit === 0 ? 0 : Math.min(999, Math.round((leadsUsed / leadsLimit) * 100))
    const seatsPct = plan.max_seats > 0 ? Math.min(999, Math.round((seatsUsed / plan.max_seats) * 100)) : 0
    const leadsOver = leadsLimit != null && leadsUsed >= leadsLimit
    const seatsFull = seatsUsed >= plan.max_seats

    return {
      accountId: a.id,
      accountName: a.name,
      planName: plan.name,
      seatsUsed,
      seatsLimit: plan.max_seats,
      seatsPct,
      leadsUsed,
      leadsLimit,
      leadsPct,
      leadsOver,
      monthlyImported: imported.get(a.id) ?? 0,
      status: leadsOver || seatsFull ? "blocked" : leadsPct >= 80 || seatsPct >= 80 ? "warning" : "ok",
    }
  })

  const order = { blocked: 0, warning: 1, ok: 2 }
  rows.sort((a, b) => order[a.status] - order[b.status] || b.leadsPct - a.leadsPct)

  return {
    rows,
    blocked: rows.filter((r) => r.status === "blocked").length,
    warning: rows.filter((r) => r.status === "warning").length,
  }
}

export type PaymentRow = {
  id: string
  accountId: string
  accountName: string
  amountInr: number
  status: string
  provider: string | null
  providerRef: string | null
  createdAt: Date
}

export type PaymentLedger = {
  rows: PaymentRow[]
  totals: {
    succeededCount: number
    succeededInr: number
    refundedCount: number
    refundedInr: number
    failedCount: number
    /** Succeeded minus refunded — what the business actually kept. */
    netInr: number
  }
  /** Distinct accounts that have ever paid successfully. */
  payingAccounts: number
  hasAny: boolean
}

/** Payments with the refund and failure picture alongside, not buried. */
export async function getPaymentLedger(
  opts: { status?: string; accountId?: string; days?: number; take?: number } = {},
): Promise<PaymentLedger> {
  const where: Prisma.PaymentWhereInput = {}
  if (opts.status) where.status = opts.status
  if (opts.accountId) where.account_id = opts.accountId
  if (opts.days) where.created_at = { gte: new Date(Date.now() - opts.days * 86_400_000) }

  // Totals ignore the status filter on purpose — the summary must describe the
  // whole ledger, not whichever slice is being viewed.
  const totalsWhere: Prisma.PaymentWhereInput = {}
  if (opts.accountId) totalsWhere.account_id = opts.accountId
  if (opts.days) totalsWhere.created_at = { gte: new Date(Date.now() - opts.days * 86_400_000) }

  const [payments, succeeded, refunded, failed, payingAccounts, anyCount] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { created_at: "desc" }, take: Math.min(300, opts.take ?? 100) }),
    prisma.payment.aggregate({ where: { ...totalsWhere, status: "succeeded" }, _count: { _all: true }, _sum: { amount_inr: true } }),
    prisma.payment.aggregate({ where: { ...totalsWhere, status: "refunded" }, _count: { _all: true }, _sum: { amount_inr: true } }),
    prisma.payment.count({ where: { ...totalsWhere, status: "failed" } }),
    prisma.payment
      .groupBy({ by: ["account_id"], where: { status: "succeeded" } })
      .then((r) => r.length),
    prisma.payment.count(),
  ])

  const names = payments.length
    ? new Map(
        (await prisma.account.findMany({
          where: { id: { in: Array.from(new Set(payments.map((p) => p.account_id))) } },
          select: { id: true, name: true },
        })).map((a) => [a.id, a.name]),
      )
    : new Map<string, string>()

  const succeededInr = Math.round((succeeded._sum.amount_inr ?? 0) / 100)
  const refundedInr = Math.round((refunded._sum.amount_inr ?? 0) / 100)

  return {
    rows: payments.map((p) => ({
      id: p.id,
      accountId: p.account_id,
      accountName: names.get(p.account_id) ?? "(deleted account)",
      amountInr: Math.round(p.amount_inr / 100),
      status: p.status,
      provider: p.provider,
      providerRef: p.provider_ref,
      createdAt: p.created_at,
    })),
    totals: {
      succeededCount: succeeded._count._all,
      succeededInr,
      refundedCount: refunded._count._all,
      refundedInr,
      failedCount: failed,
      netInr: succeededInr - refundedInr,
    },
    payingAccounts,
    hasAny: anyCount > 0,
  }
}

export type InvoiceRow = {
  id: string
  accountId: string
  accountName: string
  number: string | null
  amountInr: number
  status: string
  periodStart: Date | null
  periodEnd: Date | null
  pdfUrl: string | null
  provider: string | null
  createdAt: Date
}

export async function listInvoices(
  opts: { accountId?: string; status?: string; take?: number } = {},
): Promise<{ rows: InvoiceRow[]; totalInr: number; count: number }> {
  const where: Prisma.InvoiceWhereInput = {}
  if (opts.accountId) where.account_id = opts.accountId
  if (opts.status) where.status = opts.status

  const [invoices, agg] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { created_at: "desc" }, take: Math.min(300, opts.take ?? 100) }),
    prisma.invoice.aggregate({ where: { ...where, status: "paid" }, _sum: { amount_inr: true }, _count: { _all: true } }),
  ])

  const names = invoices.length
    ? new Map(
        (await prisma.account.findMany({
          where: { id: { in: Array.from(new Set(invoices.map((i) => i.account_id))) } },
          select: { id: true, name: true },
        })).map((a) => [a.id, a.name]),
      )
    : new Map<string, string>()

  return {
    rows: invoices.map((i) => ({
      id: i.id,
      accountId: i.account_id,
      accountName: names.get(i.account_id) ?? "(deleted account)",
      number: i.number,
      amountInr: Math.round(i.amount_inr / 100),
      status: i.status,
      periodStart: i.period_start,
      periodEnd: i.period_end,
      pdfUrl: i.pdf_url,
      provider: i.provider,
      createdAt: i.created_at,
    })),
    totalInr: Math.round((agg._sum.amount_inr ?? 0) / 100),
    count: agg._count._all,
  }
}

export async function listPayments(take = 50): Promise<PaymentRow[]> {
  const payments = await prisma.payment.findMany({ orderBy: { created_at: "desc" }, take })
  if (payments.length === 0) return []
  const names = new Map(
    (await prisma.account.findMany({
      where: { id: { in: Array.from(new Set(payments.map((p) => p.account_id))) } },
      select: { id: true, name: true },
    })).map((a) => [a.id, a.name]),
  )
  return payments.map((p) => ({
    id: p.id,
    accountId: p.account_id,
    accountName: names.get(p.account_id) ?? "(deleted account)",
    amountInr: Math.round(p.amount_inr / 100),
    status: p.status,
    provider: p.provider,
    providerRef: p.provider_ref,
    createdAt: p.created_at,
  }))
}
