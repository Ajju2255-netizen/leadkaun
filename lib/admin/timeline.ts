// Reads for the Company Timeline (per-account) and the live activity feed
// (cross-account) from account_events. Admin-only.

import { prisma } from "@/lib/prisma"
import type { AccountEventType } from "@prisma/client"

export type TimelineEvent = {
  id: string
  type: AccountEventType
  summary: string
  createdAt: Date
  accountId: string
  accountName?: string
}

export async function getCompanyTimeline(accountId: string, limit = 50): Promise<TimelineEvent[]> {
  const rows = await prisma.accountEvent.findMany({
    where: { account_id: accountId },
    orderBy: { created_at: "desc" },
    take: limit,
  })
  return rows.map((r) => ({ id: r.id, type: r.type, summary: r.summary, createdAt: r.created_at, accountId: r.account_id }))
}

export async function getRecentActivity(limit = 30): Promise<TimelineEvent[]> {
  const rows = await prisma.accountEvent.findMany({ orderBy: { created_at: "desc" }, take: limit })
  const ids = Array.from(new Set(rows.map((r) => r.account_id)))
  const accounts = await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const names = new Map(accounts.map((a) => [a.id, a.name]))
  return rows.map((r) => ({
    id: r.id, type: r.type, summary: r.summary, createdAt: r.created_at,
    accountId: r.account_id, accountName: names.get(r.account_id),
  }))
}
