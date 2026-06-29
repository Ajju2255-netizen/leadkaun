// Acquisition funnel for Mission Control (admin-only): signup → verified →
// imported → scored → brief → returned → paid, with drop-off at each step.

import { prisma } from "@/lib/prisma"

export type FunnelStage = { label: string; count: number; pct: number }

export async function getAcquisitionFunnel(): Promise<FunnelStage[]> {
  const d14 = new Date(Date.now() - 14 * 86_400_000)

  const [signup, imported, scored, briefed, returned, paid] = await Promise.all([
    prisma.account.count(),
    prisma.importJobStatus.findMany({ distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
    prisma.lead.findMany({ distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
    prisma.emailLog.findMany({ where: { template: { startsWith: "morning_brief" } }, distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
    prisma.signal.findMany({ where: { created_at: { gte: d14 } }, distinct: ["account_id"], select: { account_id: true } }).then((r) => r.length),
    prisma.subscription.count({ where: { status: "active" } }),
  ])

  // Verified = accounts whose owner's Supabase auth user has confirmed email.
  // Lives in the `auth` schema; fall back to signup count where unavailable
  // (e.g. a public-only staging clone) since registration auto-confirms.
  let verified = signup
  try {
    const rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT count(DISTINCT u.account_id) AS c
      FROM users u JOIN auth.users au ON au.id = u.auth_id
      WHERE au.email_confirmed_at IS NOT NULL`
    verified = Number(rows[0]?.c ?? signup)
  } catch {
    /* keep fallback */
  }

  const base = signup || 1
  const pct = (n: number) => Math.round((n / base) * 100)
  return [
    { label: "Signed up", count: signup, pct: 100 },
    { label: "Verified email", count: verified, pct: pct(verified) },
    { label: "Imported leads", count: imported, pct: pct(imported) },
    { label: "Generated scores", count: scored, pct: pct(scored) },
    { label: "Got morning brief", count: briefed, pct: pct(briefed) },
    { label: "Returned (active 14d)", count: returned, pct: pct(returned) },
    { label: "Paid", count: paid, pct: pct(paid) },
  ]
}
