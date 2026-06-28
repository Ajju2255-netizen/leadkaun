// Platform ("Mission Control") metrics — CROSS-ACCOUNT aggregations. Mirrors the
// per-account analytics style (app/api/analytics/dashboard) but drops all
// account/workspace scoping. Admin-only; callers must gate with
// requirePlatformAdmin before invoking.

import { prisma } from "@/lib/prisma"
import { startOfIstDay } from "@/lib/time/ist"
import { RECOMMENDATION_TOP_N } from "@/lib/analytics/recommendation-rank"

export type PlatformDashboard = {
  totals: {
    companies: number
    signupsToday: number
    activeToday: number
    importsToday: number
    leadsImportedToday: number
    totalLeads: number
  }
  // Filled in later phases; surfaced as honest "not yet" in the UI.
  billing: { payingCustomers: number | null; trials: number | null; mrrInr: number | null }
  emailsToday: number | null
  health: { api: boolean; db: boolean; queue: boolean | null; email: boolean | null; workers: boolean | null }
}

export async function getPlatformDashboard(): Promise<PlatformDashboard> {
  const dayStart = startOfIstDay()
  const since48 = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const [companies, signupsToday, activeAccts, importsToday, importedToday, totalLeads, dbOk, emailsToday, emailFailToday, recentJobs] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: { created_at: { gte: dayStart } } }),
    prisma.signal.findMany({ where: { created_at: { gte: dayStart } }, distinct: ["account_id"], select: { account_id: true } }),
    prisma.importJobStatus.count({ where: { created_at: { gte: dayStart } } }),
    prisma.importJobStatus.aggregate({ where: { created_at: { gte: dayStart } }, _sum: { inserted: true } }),
    prisma.lead.count(),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "sent" } }),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "failed" } }),
    prisma.jobRun.count({ where: { started_at: { gte: since48 } } }),
  ])

  // queue/workers healthy if any cron ran in the last 48h; null = no data yet.
  const jobsHealthy = recentJobs > 0 ? true : null
  const totalEmailToday = emailsToday + emailFailToday

  return {
    totals: {
      companies,
      signupsToday,
      activeToday: activeAccts.length,
      importsToday,
      leadsImportedToday: importedToday._sum.inserted ?? 0,
      totalLeads,
    },
    billing: { payingCustomers: null, trials: null, mrrInr: null }, // Phase 5
    emailsToday,
    health: {
      api: true,
      db: dbOk,
      queue: jobsHealthy,
      workers: jobsHealthy,
      email: totalEmailToday > 0 ? emailFailToday === 0 : null,
    },
  }
}

export type CustomerRow = {
  id: string
  name: string
  industry: string
  createdAt: Date
  users: number
  workspaces: number
  leads: number
  won: number
  conversionPct: number | null
  lastActiveAt: Date | null
  recommendationsUsed: number
  healthBand: "healthy" | "warning" | "critical"
}

// Cheap list-level band (no per-row queries) from recency + whether they've
// imported. Full weighted health lives on the Company 360.
function quickBand(leads: number, lastActiveAt: Date | null): "healthy" | "warning" | "critical" {
  if (leads === 0) return "critical"
  if (!lastActiveAt) return "critical"
  const days = (Date.now() - new Date(lastActiveAt).getTime()) / 86_400_000
  if (days <= 7) return "healthy"
  if (days <= 14) return "warning"
  return "critical"
}

export async function getCustomersList(): Promise<CustomerRow[]> {
  const [accounts, leadsBy, wonBy, lastBy, adoptionBy] = await Promise.all([
    prisma.account.findMany({
      select: { id: true, name: true, industry: true, created_at: true, _count: { select: { users: true, workspaces: true } } },
      orderBy: { created_at: "desc" },
    }),
    prisma.lead.groupBy({ by: ["account_id"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["account_id"], where: { won_at: { not: null } }, _count: { _all: true } }),
    prisma.signal.groupBy({ by: ["account_id"], _max: { created_at: true } }),
    prisma.lead.groupBy({ by: ["account_id"], where: { first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N } }, _count: { _all: true } }),
  ])

  const leadsMap = new Map(leadsBy.map((r) => [r.account_id, r._count._all]))
  const wonMap = new Map(wonBy.map((r) => [r.account_id, r._count._all]))
  const lastMap = new Map(lastBy.map((r) => [r.account_id, r._max.created_at]))
  const adoptMap = new Map(adoptionBy.map((r) => [r.account_id, r._count._all]))

  return accounts.map((a) => {
    const leads = leadsMap.get(a.id) ?? 0
    const won = wonMap.get(a.id) ?? 0
    return {
      id: a.id,
      name: a.name,
      industry: a.industry,
      createdAt: a.created_at,
      users: a._count.users,
      workspaces: a._count.workspaces,
      leads,
      won,
      conversionPct: leads > 0 ? Math.round((won / leads) * 100) : null,
      lastActiveAt: lastMap.get(a.id) ?? null,
      recommendationsUsed: adoptMap.get(a.id) ?? 0,
      healthBand: quickBand(leads, lastMap.get(a.id) ?? null),
    }
  })
}

export type Company360 = {
  account: { id: string; name: string; industry: string; city: string; state: string; teamSize: string; createdAt: Date; icpConfigured: boolean }
  owner: { name: string; email: string } | null
  usage: { leads: number; activities: number; recommendationsUsed: number; followUps: number; won: number; wonValueInr: number }
  team: { id: string; name: string; email: string; role: string; isActive: boolean }[]
  workspaces: { id: string; name: string; isDefault: boolean; leadCount: number }[]
  lastActiveAt: Date | null
}

export async function getCompany360(accountId: string): Promise<Company360 | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, industry: true, city: true, state: true, team_size: true, created_at: true, icp_configured: true },
  })
  if (!account) return null

  const [owner, leads, activities, adoption, followUps, wonAgg, team, wsRows, wsLeadCounts, lastSignal] = await Promise.all([
    prisma.user.findFirst({ where: { account_id: accountId, role: "ADMIN" }, orderBy: { created_at: "asc" }, select: { first_name: true, last_name: true, email: true } }),
    prisma.lead.count({ where: { account_id: accountId } }),
    prisma.signal.count({ where: { account_id: accountId, signal_type: { not: "SOURCE_BASELINE" } } }),
    prisma.lead.count({ where: { account_id: accountId, first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N } } }),
    prisma.followUpAction.count({ where: { account_id: accountId } }),
    prisma.lead.aggregate({ where: { account_id: accountId, won_at: { not: null } }, _count: { _all: true }, _sum: { won_value: true } }),
    prisma.user.findMany({ where: { account_id: accountId }, select: { id: true, first_name: true, last_name: true, email: true, role: true, is_active: true }, orderBy: [{ role: "asc" }, { first_name: "asc" }] }),
    prisma.workspace.findMany({ where: { account_id: accountId }, select: { id: true, name: true, is_default: true } }),
    prisma.lead.groupBy({ by: ["workspace_id"], where: { account_id: accountId }, _count: { _all: true } }),
    prisma.signal.aggregate({ where: { account_id: accountId }, _max: { created_at: true } }),
  ])
  const wsLeadMap = new Map(wsLeadCounts.map((r) => [r.workspace_id, r._count._all]))

  return {
    account: {
      id: account.id, name: account.name, industry: account.industry, city: account.city, state: account.state,
      teamSize: account.team_size, createdAt: account.created_at, icpConfigured: account.icp_configured,
    },
    owner: owner ? { name: `${owner.first_name} ${owner.last_name}`.trim(), email: owner.email } : null,
    usage: {
      leads, activities, recommendationsUsed: adoption, followUps,
      won: wonAgg._count._all, wonValueInr: wonAgg._sum.won_value ?? 0,
    },
    team: team.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`.trim(), email: u.email, role: u.role, isActive: u.is_active })),
    workspaces: wsRows.map((w) => ({ id: w.id, name: w.name, isDefault: w.is_default, leadCount: wsLeadMap.get(w.id) ?? 0 })),
    lastActiveAt: lastSignal._max.created_at,
  }
}
