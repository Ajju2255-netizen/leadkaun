// "What should I do today?" — the daily Mission Control digest. Derived from
// real cross-account state (template-first; an LLM summary can layer on later).
// Computed live on the dashboard and snapshotted daily by an Inngest cron.

import { prisma } from "@/lib/prisma"

export type InsightSeverity = "info" | "warn" | "critical"
export type Insight = { label: string; count: number; severity: InsightSeverity; href?: string }

export function istDateString(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) // YYYY-MM-DD
}

export async function computeDailyInsights(): Promise<Insight[]> {
  const now = Date.now()
  const d7 = new Date(now - 7 * 86_400_000)
  const d14 = new Date(now - 14 * 86_400_000)

  const [totalAccounts, newWeek, active14, trialing, activeSubs, importedAccts] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: { created_at: { gte: d7 } } }),
    prisma.signal.findMany({ where: { created_at: { gte: d14 } }, distinct: ["account_id"], select: { account_id: true } }),
    prisma.subscription.findMany({ where: { status: "trialing" }, select: { account_id: true } }),
    prisma.subscription.findMany({ where: { status: "active" }, select: { account_id: true } }),
    prisma.importJobStatus.findMany({ distinct: ["account_id"], select: { account_id: true } }),
  ])

  const active = new Set(active14.map((s) => s.account_id))
  const imported = new Set(importedAccts.map((s) => s.account_id))
  const inactiveTrials = trialing.filter((s) => !active.has(s.account_id)).length
  const churnRisk = activeSubs.filter((s) => !active.has(s.account_id)).length
  const notOnboarded = Math.max(0, totalAccounts - imported.size)

  const plural = (n: number) => (n > 1 ? "s" : "")
  const out: Insight[] = []
  if (newWeek > 0) out.push({ label: `${newWeek} new customer${plural(newWeek)} this week`, count: newWeek, severity: "info", href: "/admin/customers" })
  if (churnRisk > 0) out.push({ label: `${churnRisk} paying account${plural(churnRisk)} inactive 14d — churn risk`, count: churnRisk, severity: "critical", href: "/admin/customers" })
  if (inactiveTrials > 0) out.push({ label: `${inactiveTrials} inactive trial${plural(inactiveTrials)}`, count: inactiveTrials, severity: "warn", href: "/admin/customers" })
  if (notOnboarded > 0) out.push({ label: `${notOnboarded} account${plural(notOnboarded)} haven't imported yet`, count: notOnboarded, severity: "warn", href: "/admin/customers" })
  if (out.length === 0) out.push({ label: "All quiet — no action items today", count: 0, severity: "info" })
  return out
}

// Today's stored snapshot if the cron has run, else compute live.
export async function getLatestInsights(): Promise<Insight[]> {
  const row = await prisma.adminInsight.findUnique({ where: { for_date: istDateString() } }).catch(() => null)
  if (row) return row.items as Insight[]
  return computeDailyInsights()
}
