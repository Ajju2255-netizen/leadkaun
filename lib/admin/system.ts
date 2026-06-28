// System-health + error reads for Mission Control (admin-only). DB ping, email
// deliverability (EmailLog), cron heartbeats (JobRun), rate-limit pressure, and
// recent failures.

import { prisma } from "@/lib/prisma"
import { startOfIstDay } from "@/lib/time/ist"

export const CRON_FUNCTIONS = [
  "morning-brief", "intent-decay", "icp-regrade", "follow-up-overdue",
  "missed-opportunity", "exec-score-alert", "sheets-sync",
]

const STALE_MS = 48 * 60 * 60 * 1000

export type SystemHealth = {
  dbOk: boolean
  emailsToday: number
  emailFailedToday: number
  rateLimitKeys: number
  crons: { name: string; lastRunAt: Date | null; lastStatus: string | null; healthy: boolean }[]
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const dayStart = startOfIstDay()
  const [dbOk, emailsToday, emailFailedToday, rateLimitKeys] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "sent" } }),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "failed" } }),
    prisma.rateLimit.count(),
  ])

  // Latest status per function (separate small query — groupBy can't carry it).
  const latest = await Promise.all(
    CRON_FUNCTIONS.map((name) =>
      prisma.jobRun.findFirst({ where: { function: name }, orderBy: { started_at: "desc" }, select: { status: true, started_at: true } })
    )
  )

  const crons = CRON_FUNCTIONS.map((name, i) => {
    const last = latest[i]?.started_at ?? null
    return {
      name,
      lastRunAt: last,
      lastStatus: latest[i]?.status ?? null,
      healthy: last != null && Date.now() - new Date(last).getTime() < STALE_MS,
    }
  })

  return { dbOk, emailsToday, emailFailedToday, rateLimitKeys, crons }
}

export type ErrorRow = { id: string; kind: "import" | "email"; account_id: string | null; summary: string; at: Date }

export async function getRecentErrors(limit = 25): Promise<ErrorRow[]> {
  const [imports, emails] = await Promise.all([
    prisma.importJobStatus.findMany({
      where: { status: "FAILED" }, orderBy: { created_at: "desc" }, take: limit,
      select: { id: true, account_id: true, file_name: true, errors: true, created_at: true },
    }),
    prisma.emailLog.findMany({
      where: { status: "failed" }, orderBy: { created_at: "desc" }, take: limit,
      select: { id: true, account_id: true, template: true, error: true, created_at: true },
    }),
  ])
  const rows: ErrorRow[] = [
    ...imports.map((i) => ({ id: i.id, kind: "import" as const, account_id: i.account_id, summary: `Import failed${i.file_name ? ` · ${i.file_name}` : ""} (${i.errors} errors)`, at: i.created_at })),
    ...emails.map((e) => ({ id: e.id, kind: "email" as const, account_id: e.account_id, summary: `Email failed · ${e.template}${e.error ? ` — ${e.error}` : ""}`, at: e.created_at })),
  ]
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
}
