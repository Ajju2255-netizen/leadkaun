// Email engagement for Mission Control (admin-only): per-template sent / opened
// / failed + open rate. Opens require the Resend webhook (→ /api/webhooks/resend).

import { prisma } from "@/lib/prisma"

export type EmailTemplateStat = { template: string; sent: number; opened: number; failed: number; openPct: number | null }

export async function getEmailStats(): Promise<{ totalSent: number; totalOpened: number; anyOpens: boolean; templates: EmailTemplateStat[] }> {
  const [sentBy, openedBy, failedBy] = await Promise.all([
    prisma.emailLog.groupBy({ by: ["template"], where: { status: "sent" }, _count: { _all: true } }),
    prisma.emailLog.groupBy({ by: ["template"], where: { opened_at: { not: null } }, _count: { _all: true } }),
    prisma.emailLog.groupBy({ by: ["template"], where: { status: "failed" }, _count: { _all: true } }),
  ])

  const openedMap = new Map(openedBy.map((r) => [r.template, r._count._all]))
  const failedMap = new Map(failedBy.map((r) => [r.template, r._count._all]))

  const templates: EmailTemplateStat[] = sentBy
    .map((r) => {
      const sent = r._count._all
      const opened = openedMap.get(r.template) ?? 0
      return { template: r.template, sent, opened, failed: failedMap.get(r.template) ?? 0, openPct: sent > 0 ? Math.round((opened / sent) * 100) : null }
    })
    .sort((a, b) => b.sent - a.sent)

  const totalSent = templates.reduce((s, t) => s + t.sent, 0)
  const totalOpened = templates.reduce((s, t) => s + t.opened, 0)
  return { totalSent, totalOpened, anyOpens: totalOpened > 0, templates }
}
