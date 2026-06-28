// Cross-account feature-adoption proxies for Mission Control. Derived from real
// activity (no page-view tracking yet), so each row is honestly an activity
// signal, not a precise "opened this screen" count.

import { prisma } from "@/lib/prisma"

export type UsageRow = { label: string; count: number; pct: number }

export async function getFeatureUsage(): Promise<{ total: number; rows: UsageRow[] }> {
  const total = await prisma.account.count()
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  const [imported, active, icp, wins, learningReady] = await Promise.all([
    prisma.importJobStatus.findMany({ distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
    prisma.signal.findMany({ distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
    prisma.account.count({ where: { icp_configured: true } }),
    prisma.lead.findMany({ where: { won_at: { not: null } }, distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
    prisma.lead.findMany({ where: { first_action_rank: { not: null } }, distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
  ])

  return {
    total,
    rows: [
      { label: "Imported leads", count: imported, pct: pct(imported) },
      { label: "Logged activity (Queue / Pipeline)", count: active, pct: pct(active) },
      { label: "Configured ICP", count: icp, pct: pct(icp) },
      { label: "Worked recommended leads (Learning)", count: learningReady, pct: pct(learningReady) },
      { label: "Closed a deal", count: wins, pct: pct(wins) },
    ],
  }
}
