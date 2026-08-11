// ─────────────────────────────────────────────
// REVENUE HISTORY — reconstructed, not stored (Mission Control)
//
// `subscriptions.mrr_inr` holds ONE current value and is overwritten on every
// plan change, so there is no MRR history column to read. There is, however, an
// append-only trail that both write paths already produce:
//
//   · manual  (/api/admin/platform/subscription) → PLAN_CHANGED
//                detail = { plan, status, mrrRupees }   ← carries the rupee value
//   · webhook (/api/billing/webhook)             → PLAN_CHANGED / PAYMENT_*
//                detail = { provider, plan }            ← carries the plan key
//
// So a per-account MRR timeline can be REBUILT by walking those events in order
// and resolving each one to a rupee figure. That is what this module does.
//
// Be clear about what that means:
//   · History only reaches back as far as `account_events` does. Anything that
//     happened before the event stream existed is invisible, not zero.
//   · A resolution can fail (an old event with neither a rupee value nor a
//     recognisable plan key). Those are reported as `unresolved` rather than
//     silently treated as ₹0, which would fabricate a churn event.
//   · This is a reconstruction. A dedicated MRR-change table would be exact;
//     until one exists, every screen using this says so.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import type { AccountEventType, Prisma } from "@prisma/client"

/** Event types that can move MRR or represent money. */
const REVENUE_EVENT_TYPES: AccountEventType[] = [
  "PLAN_CHANGED", "PAYMENT_SUCCEEDED", "PAYMENT_FAILED", "TRIAL_STARTED", "TRIAL_ENDED",
]

/** Plain rupee string for summaries written on the server. */
const inrPlain = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`

function detailOf(v: Prisma.JsonValue | null): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Does this event describe a subscription ending? Our own summaries are stable. */
function looksLikeEnding(summary: string, detail: Record<string, unknown>): boolean {
  if (detail.status === "canceled") return true
  return /subscription ended|cancelled|canceled/i.test(summary)
}

/**
 * Resolve one PLAN_CHANGED event to the MRR it left the account on.
 * Returns null when it genuinely cannot be determined — never a guessed 0.
 */
function resolveMrr(
  summary: string,
  detail: Record<string, unknown>,
  planPriceByKey: Map<string, number>,
): number | null {
  if (looksLikeEnding(summary, detail)) return 0
  if (typeof detail.mrrRupees === "number") return detail.mrrRupees
  // A trial is a paid plan that isn't producing revenue yet.
  if (detail.status === "trialing") return 0
  if (typeof detail.plan === "string") {
    const price = planPriceByKey.get(detail.plan)
    if (price != null) return price
  }
  return null
}

// ── Per-account timeline ──────────────────────────────────────────────────────

export type RevenueEntry = {
  id: string
  at: Date
  kind: "plan" | "payment" | "payment-failed" | "invoice" | "trial"
  summary: string
  /** MRR the account was on AFTER this event. null = could not be resolved. */
  mrrInr: number | null
  /** Change vs the previous resolved MRR. null when either side is unknown. */
  deltaInr: number | null
  /** Money actually moved by this entry (a payment or refund). */
  amountInr: number | null
  reference: string | null
  pdfUrl: string | null
}

export type AccountRevenueHistory = {
  entries: RevenueEntry[]
  currentMrrInr: number
  /** Highest MRR the account ever reached, as far back as events go. */
  peakMrrInr: number | null
  lifetimeCollectedInr: number
  refundedInr: number
  paymentCount: number
  invoiceCount: number
  unresolved: number
  /** Oldest event we have — history does not exist before this. */
  earliestAt: Date | null
}

export async function getAccountRevenueHistory(accountId: string): Promise<AccountRevenueHistory> {
  const [events, payments, invoices, plans, sub] = await Promise.all([
    prisma.accountEvent.findMany({
      where: { account_id: accountId, type: { in: REVENUE_EVENT_TYPES } },
      orderBy: { created_at: "asc" },
    }),
    prisma.payment.findMany({ where: { account_id: accountId }, orderBy: { created_at: "asc" } }),
    prisma.invoice.findMany({ where: { account_id: accountId }, orderBy: { created_at: "asc" } }),
    prisma.plan.findMany({ select: { key: true, price_inr: true } }),
    prisma.subscription.findUnique({ where: { account_id: accountId }, select: { mrr_inr: true, status: true } }),
  ])

  const planPriceByKey = new Map(plans.map((p) => [p.key, Math.round(p.price_inr / 100)]))

  const entries: RevenueEntry[] = []
  let runningMrr: number | null = null
  let peak: number | null = null
  let unresolved = 0

  for (const e of events) {
    const detail = detailOf(e.detail)
    if (e.type === "PLAN_CHANGED") {
      const mrr = resolveMrr(e.summary, detail, planPriceByKey)
      if (mrr == null) unresolved++
      const delta = mrr != null && runningMrr != null ? mrr - runningMrr : null
      if (mrr != null) {
        runningMrr = mrr
        peak = peak == null ? mrr : Math.max(peak, mrr)
      }
      entries.push({
        id: `ev_${e.id}`, at: e.created_at, kind: "plan", summary: e.summary,
        mrrInr: mrr, deltaInr: delta, amountInr: null,
        reference: typeof detail.plan === "string" ? detail.plan : null, pdfUrl: null,
      })
    } else if (e.type === "TRIAL_STARTED" || e.type === "TRIAL_ENDED") {
      entries.push({
        id: `ev_${e.id}`, at: e.created_at, kind: "trial", summary: e.summary,
        mrrInr: runningMrr, deltaInr: null, amountInr: null, reference: null, pdfUrl: null,
      })
    } else if (e.type === "PAYMENT_FAILED") {
      entries.push({
        id: `ev_${e.id}`, at: e.created_at, kind: "payment-failed", summary: e.summary,
        mrrInr: runningMrr, deltaInr: null, amountInr: null,
        reference: typeof detail.plan === "string" ? detail.plan : null, pdfUrl: null,
      })
    }
    // PAYMENT_SUCCEEDED is deliberately skipped — the Payment row below is the
    // authoritative record of the same money, with the exact amount.
  }

  for (const p of payments) {
    const amount = Math.round(p.amount_inr / 100)
    entries.push({
      id: `pay_${p.id}`,
      at: p.created_at,
      kind: p.status === "failed" ? "payment-failed" : "payment",
      summary:
        p.status === "refunded" ? `Payment refunded — ${inrPlain(amount)} returned`
        : p.status === "failed" ? `Payment of ${inrPlain(amount)} failed — nothing was charged`
        : "Payment received",
      mrrInr: null,
      deltaInr: null,
      // A failed payment moved no money. Rendering its attempted amount in the
      // same column as real receipts would read as revenue that never existed.
      amountInr: p.status === "failed" ? null : p.status === "refunded" ? -amount : amount,
      reference: p.provider_ref ?? p.provider ?? null,
      pdfUrl: null,
    })
  }

  for (const i of invoices) {
    entries.push({
      id: `inv_${i.id}`, at: i.created_at, kind: "invoice",
      summary: `Invoice ${i.number ?? i.id.slice(-8)} · ${i.status}`,
      mrrInr: null, deltaInr: null, amountInr: Math.round(i.amount_inr / 100),
      reference: i.number ?? i.provider_ref ?? null, pdfUrl: i.pdf_url,
    })
  }

  entries.sort((a, b) => b.at.getTime() - a.at.getTime())

  const collected = payments
    .filter((p) => p.status === "succeeded")
    .reduce((s, p) => s + Math.round(p.amount_inr / 100), 0)
  const refunded = payments
    .filter((p) => p.status === "refunded")
    .reduce((s, p) => s + Math.round(p.amount_inr / 100), 0)

  const currentMrr = sub && sub.status === "active" ? Math.round(sub.mrr_inr / 100) : 0

  return {
    entries,
    currentMrrInr: currentMrr,
    peakMrrInr: peak == null ? (currentMrr > 0 ? currentMrr : null) : Math.max(peak, currentMrr),
    lifetimeCollectedInr: collected,
    refundedInr: refunded,
    paymentCount: payments.length,
    invoiceCount: invoices.length,
    unresolved,
    earliestAt: events[0]?.created_at ?? payments[0]?.created_at ?? null,
  }
}

// ── Platform-wide MRR movement ────────────────────────────────────────────────

export type MrrMovementMonth = {
  month: string
  label: string
  newInr: number
  expansionInr: number
  contractionInr: number
  churnInr: number
  netInr: number
  newCount: number
  churnCount: number
}

export type MrrMovement = {
  months: MrrMovementMonth[]
  /** Events that could not be resolved to a rupee figure. */
  unresolved: number
  /** Accounts whose history was walked. */
  accountsCovered: number
  earliestAt: Date | null
  hasData: boolean
}

function monthKey(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000)
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-")
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1))
    .toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })
}

/**
 * Walk every account's PLAN_CHANGED trail in order and bucket each MRR delta
 * into new / expansion / contraction / churn, by month.
 *
 *   0  → >0  new
 *   >0 → >0  expansion (up) or contraction (down)
 *   >0 → 0   churn
 */
export async function getMrrMovement(months = 12): Promise<MrrMovement> {
  const [events, plans] = await Promise.all([
    prisma.accountEvent.findMany({
      where: { type: "PLAN_CHANGED" },
      orderBy: { created_at: "asc" },
      select: { account_id: true, summary: true, detail: true, created_at: true },
    }),
    prisma.plan.findMany({ select: { key: true, price_inr: true } }),
  ])

  if (events.length === 0) {
    return { months: fill([], months), unresolved: 0, accountsCovered: 0, earliestAt: null, hasData: false }
  }

  const planPriceByKey = new Map(plans.map((p) => [p.key, Math.round(p.price_inr / 100)]))
  const running = new Map<string, number>() // account → last resolved MRR
  const buckets = new Map<string, MrrMovementMonth>()
  let unresolved = 0

  const bucket = (ym: string): MrrMovementMonth => {
    const b = buckets.get(ym) ?? {
      month: ym, label: monthLabel(ym),
      newInr: 0, expansionInr: 0, contractionInr: 0, churnInr: 0, netInr: 0,
      newCount: 0, churnCount: 0,
    }
    buckets.set(ym, b)
    return b
  }

  for (const e of events) {
    const mrr = resolveMrr(e.summary, detailOf(e.detail), planPriceByKey)
    if (mrr == null) { unresolved++; continue }

    const prev = running.get(e.account_id) ?? 0
    running.set(e.account_id, mrr)
    if (mrr === prev) continue

    const b = bucket(monthKey(e.created_at))
    const diff = mrr - prev
    if (prev === 0 && mrr > 0) { b.newInr += mrr; b.newCount++ }
    else if (prev > 0 && mrr === 0) { b.churnInr += prev; b.churnCount++ }
    else if (diff > 0) b.expansionInr += diff
    else b.contractionInr += -diff
    b.netInr += diff
  }

  return {
    months: fill(Array.from(buckets.values()), months),
    unresolved,
    accountsCovered: running.size,
    earliestAt: events[0].created_at,
    hasData: buckets.size > 0,
  }
}

/** Back-fill empty months so a gap reads as zero rather than disappearing. */
function fill(rows: MrrMovementMonth[], months: number): MrrMovementMonth[] {
  const found = new Map(rows.map((r) => [r.month, r]))
  const out: MrrMovementMonth[] = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    out.push(
      found.get(ym) ?? {
        month: ym, label: monthLabel(ym),
        newInr: 0, expansionInr: 0, contractionInr: 0, churnInr: 0, netInr: 0,
        newCount: 0, churnCount: 0,
      },
    )
  }
  return out
}
