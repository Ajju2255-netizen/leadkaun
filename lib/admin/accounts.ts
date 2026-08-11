// ─────────────────────────────────────────────
// ACCOUNTS — the filterable customer list + the deep per-account reads that
// sit behind Account 360 (Mission Control).
//
// The list is deliberately computed with grouped aggregates rather than
// per-row queries: one query per dimension, joined in memory. Filtering happens
// after the join so a filter never changes the shape of the underlying reads.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { quickBand } from "@/lib/admin/overview"
import { ACTIVE_LEAD } from "@/lib/billing/lead-usage"
import { OCCUPIES_SEAT } from "@/lib/billing/seats"
import { RECOMMENDATION_TOP_N } from "@/lib/analytics/recommendation-rank"
import { ImportStatus, IntakeState, type LeadGrade } from "@prisma/client"

const DAY = 86_400_000

export type AccountRow = {
  id: string
  name: string
  industry: string
  city: string
  state: string
  teamSize: string
  createdAt: Date
  signupSource: string | null
  users: number
  workspaces: number
  leads: number
  activeLeads: number
  won: number
  conversionPct: number | null
  lastActiveAt: Date | null
  recommendationsUsed: number
  healthBand: "healthy" | "warning" | "critical"
  planName: string | null
  planKey: string | null
  mrrInr: number | null
  subStatus: string | null
  icpConfigured: boolean
  hasImported: boolean
  activated: boolean
}

export type AccountFilters = {
  q?: string
  plan?: string
  health?: "healthy" | "warning" | "critical"
  industry?: string
  state?: string
  /** activated · onboarding · never-imported */
  activation?: string
  status?: string
  /** Signup window: today · 7d · 30d · 90d · month */
  joined?: string
  sort?: "recent" | "leads" | "mrr" | "active" | "name"
}

/** Lower bound for a "joined" filter value, or null for no bound. */
function joinedSince(key: string | undefined): Date | null {
  const now = Date.now()
  switch (key) {
    case "today": {
      const d = new Date()
      // IST day boundary, to match how signups are counted elsewhere.
      const ist = new Date(now + 5.5 * 3600_000)
      ist.setUTCHours(0, 0, 0, 0)
      d.setTime(ist.getTime() - 5.5 * 3600_000)
      return d
    }
    case "7d": return new Date(now - 7 * 86_400_000)
    case "30d": return new Date(now - 30 * 86_400_000)
    case "90d": return new Date(now - 90 * 86_400_000)
    case "month": {
      const ist = new Date(now + 5.5 * 3600_000)
      const first = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1))
      return new Date(first.getTime() - 5.5 * 3600_000)
    }
    default: return null
  }
}

export type AccountFacets = {
  industries: string[]
  states: string[]
  plans: { key: string; name: string }[]
  statuses: string[]
}

export async function listAccounts(f: AccountFilters = {}): Promise<{ rows: AccountRow[]; facets: AccountFacets; total: number }> {
  const [accounts, leadsBy, activeLeadsBy, wonBy, lastBy, adoptionBy, subs, importedSet, actedSet, plans, wsBy] =
    await Promise.all([
      prisma.account.findMany({
        select: {
          id: true, name: true, industry: true, city: true, state: true, team_size: true,
          created_at: true, icp_configured: true, signup_utm_source: true,
          _count: { select: { users: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.lead.groupBy({ by: ["account_id"], _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["account_id"], where: ACTIVE_LEAD, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["account_id"], where: { won_at: { not: null } }, _count: { _all: true } }),
      prisma.signal.groupBy({ by: ["account_id"], _max: { created_at: true } }),
      prisma.lead.groupBy({
        by: ["account_id"],
        where: { first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N } },
        _count: { _all: true },
      }),
      prisma.subscription.findMany({ include: { plan: { select: { key: true, name: true } } } }),
      prisma.importJobStatus
        .findMany({ where: { status: ImportStatus.COMPLETE }, distinct: ["account_id"], select: { account_id: true } })
        .then((r) => new Set(r.map((x) => x.account_id))),
      prisma.signal
        .findMany({ where: { signal_type: { not: "SOURCE_BASELINE" } }, distinct: ["account_id"], select: { account_id: true } })
        .then((r) => new Set(r.map((x) => x.account_id))),
      prisma.plan.findMany({ where: { is_active: true }, orderBy: { price_inr: "asc" }, select: { key: true, name: true } }),
      prisma.workspace.groupBy({ by: ["account_id"], where: { archived_at: null }, _count: { _all: true } }),
    ])

  const leadsMap = new Map(leadsBy.map((r) => [r.account_id, r._count._all]))
  const activeMap = new Map(activeLeadsBy.map((r) => [r.account_id, r._count._all]))
  const wonMap = new Map(wonBy.map((r) => [r.account_id, r._count._all]))
  const lastMap = new Map(lastBy.map((r) => [r.account_id, r._max.created_at]))
  const adoptMap = new Map(adoptionBy.map((r) => [r.account_id, r._count._all]))
  const wsMap = new Map(wsBy.map((r) => [r.account_id, r._count._all]))
  const subMap = new Map(
    subs.map((s) => [s.account_id, { planKey: s.plan.key, planName: s.plan.name, mrrInr: Math.round(s.mrr_inr / 100), status: s.status }]),
  )

  let rows: AccountRow[] = accounts.map((a) => {
    const leads = leadsMap.get(a.id) ?? 0
    const won = wonMap.get(a.id) ?? 0
    const lastActiveAt = lastMap.get(a.id) ?? null
    const sub = subMap.get(a.id)
    const hasImported = importedSet.has(a.id)
    return {
      id: a.id,
      name: a.name,
      industry: a.industry,
      city: a.city,
      state: a.state,
      teamSize: a.team_size,
      createdAt: a.created_at,
      signupSource: a.signup_utm_source,
      users: a._count.users,
      workspaces: wsMap.get(a.id) ?? 0,
      leads,
      activeLeads: activeMap.get(a.id) ?? 0,
      won,
      conversionPct: leads > 0 ? Math.round((won / leads) * 100) : null,
      lastActiveAt,
      recommendationsUsed: adoptMap.get(a.id) ?? 0,
      healthBand: quickBand(leads, lastActiveAt),
      planName: sub?.planName ?? null,
      planKey: sub?.planKey ?? null,
      mrrInr: sub?.mrrInr ?? null,
      subStatus: sub?.status ?? null,
      icpConfigured: a.icp_configured,
      hasImported,
      activated: hasImported && actedSet.has(a.id),
    }
  })

  const facets: AccountFacets = {
    industries: Array.from(new Set(accounts.map((a) => a.industry).filter(Boolean))).sort(),
    states: Array.from(new Set(accounts.map((a) => a.state).filter(Boolean))).sort(),
    plans,
    statuses: Array.from(new Set(subs.map((s) => s.status))).sort(),
  }
  const total = rows.length

  // ── filters ──
  if (f.q) {
    const q = f.q.toLowerCase()
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.industry.toLowerCase().includes(q) || r.city.toLowerCase().includes(q),
    )
  }
  if (f.plan) rows = rows.filter((r) => (f.plan === "none" ? r.planKey == null : r.planKey === f.plan))
  if (f.health) rows = rows.filter((r) => r.healthBand === f.health)
  if (f.industry) rows = rows.filter((r) => r.industry === f.industry)
  if (f.state) rows = rows.filter((r) => r.state === f.state)
  if (f.status) rows = rows.filter((r) => r.subStatus === f.status)
  const since = joinedSince(f.joined)
  if (since) rows = rows.filter((r) => r.createdAt >= since)
  if (f.activation === "activated") rows = rows.filter((r) => r.activated)
  if (f.activation === "onboarding") rows = rows.filter((r) => r.hasImported && !r.activated)
  if (f.activation === "never-imported") rows = rows.filter((r) => !r.hasImported)

  // ── sort ──
  const sorters: Record<string, (a: AccountRow, b: AccountRow) => number> = {
    recent: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    leads: (a, b) => b.leads - a.leads,
    mrr: (a, b) => (b.mrrInr ?? -1) - (a.mrrInr ?? -1),
    active: (a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
    name: (a, b) => a.name.localeCompare(b.name),
  }
  rows.sort(sorters[f.sort ?? "recent"] ?? sorters.recent)

  return { rows, facets, total }
}

// ── Account 360 depth ─────────────────────────────────────────────────────────

export type ActivationStep = { label: string; done: boolean; at: Date | null; hint: string }

/** The onboarding checklist, each step backed by a real row and its timestamp. */
export async function getAccountActivation(accountId: string): Promise<ActivationStep[]> {
  const [account, firstWorkspace, firstIntake, firstImport, firstLead, firstScoreEvent, firstReco, firstAction, icpEvent] =
    await Promise.all([
      prisma.account.findUnique({ where: { id: accountId }, select: { created_at: true, icp_configured: true } }),
      prisma.workspace.findFirst({ where: { account_id: accountId }, orderBy: { created_at: "asc" }, select: { created_at: true } }),
      prisma.intakeSession.findFirst({ where: { account_id: accountId }, orderBy: { created_at: "asc" }, select: { created_at: true } }),
      prisma.importJobStatus.findFirst({
        where: { account_id: accountId, status: ImportStatus.COMPLETE },
        orderBy: { created_at: "asc" }, select: { completed_at: true, created_at: true },
      }),
      prisma.lead.findFirst({ where: { account_id: accountId }, orderBy: { created_at: "asc" }, select: { created_at: true } }),
      prisma.leadScoreEvent.findFirst({ where: { account_id: accountId }, orderBy: { occurred_at: "asc" }, select: { occurred_at: true } }),
      prisma.recommendationEvent.findFirst({
        where: { account_id: accountId, event: "SHOWN" }, orderBy: { created_at: "asc" }, select: { created_at: true },
      }),
      prisma.signal.findFirst({
        where: { account_id: accountId, signal_type: { not: "SOURCE_BASELINE" } },
        orderBy: { created_at: "asc" }, select: { created_at: true },
      }),
      prisma.accountEvent.findFirst({
        where: { account_id: accountId, type: "ICP_CONFIGURED" }, orderBy: { created_at: "asc" }, select: { created_at: true },
      }),
    ])

  return [
    { label: "Signed up", done: !!account, at: account?.created_at ?? null, hint: "Account row created at registration." },
    { label: "Workspace created", done: !!firstWorkspace, at: firstWorkspace?.created_at ?? null, hint: "Seeded automatically with 8 stages + default sources." },
    { label: "ICP configured", done: !!account?.icp_configured, at: icpEvent?.created_at ?? null, hint: "The scoring brain — until this is set, fit short-circuits to a flat baseline." },
    { label: "Intake started", done: !!firstIntake, at: firstIntake?.created_at ?? null, hint: "First dataset uploaded and profiled." },
    { label: "Import completed", done: !!firstImport, at: firstImport?.completed_at ?? firstImport?.created_at ?? null, hint: "First import_job_status reaching COMPLETE." },
    { label: "Leads scored", done: !!firstLead, at: firstLead?.created_at ?? null, hint: "Every lead is graded on create by the orchestrator." },
    { label: "First score event", done: !!firstScoreEvent, at: firstScoreEvent?.occurred_at ?? null, hint: "The Score Evolution timeline has something in it." },
    { label: "First recommendation", done: !!firstReco, at: firstReco?.created_at ?? null, hint: "A recommendation was rendered to a rep (RAR denominator)." },
    { label: "First real action", done: !!firstAction, at: firstAction?.created_at ?? null, hint: "A call/WhatsApp/override signal — not an import-time signal." },
  ]
}

export type AccountLimits = {
  seats: { used: number; limit: number; pct: number; isFull: boolean }
  leads: { used: number; limit: number | null; pct: number; isOver: boolean; nearLimit: boolean }
  planName: string
  planKey: string
  subStatus: string | null
}

/**
 * Usage against the plan's real caps. Mirrors lib/billing/seats.ts and
 * lib/billing/lead-usage.ts exactly — including the fail-closed fallback to
 * Free when there is no subscription or it has been cancelled — so admin never
 * disagrees with what the customer's own billing page shows.
 */
export async function getAccountLimits(accountId: string): Promise<AccountLimits> {
  const [seatsUsed, leadsUsed, sub, trialPlan] = await Promise.all([
    prisma.user.count({ where: { account_id: accountId, ...OCCUPIES_SEAT } }),
    prisma.lead.count({ where: { account_id: accountId, ...ACTIVE_LEAD } }),
    prisma.subscription.findUnique({
      where: { account_id: accountId },
      select: { status: true, plan: { select: { key: true, name: true, max_seats: true, active_lead_limit: true } } },
    }),
    prisma.plan.findUnique({ where: { key: "trial" }, select: { key: true, name: true, max_seats: true, active_lead_limit: true } }),
  ])

  const plan = (sub && sub.status !== "canceled" ? sub.plan : trialPlan) ?? {
    key: "trial", name: "Free", max_seats: 1, active_lead_limit: 100,
  }
  const leadLimit = plan.active_lead_limit

  return {
    seats: {
      used: seatsUsed,
      limit: plan.max_seats,
      pct: plan.max_seats > 0 ? Math.min(100, Math.round((seatsUsed / plan.max_seats) * 100)) : 0,
      isFull: seatsUsed >= plan.max_seats,
    },
    leads: {
      used: leadsUsed,
      limit: leadLimit,
      pct: leadLimit == null || leadLimit === 0 ? 0 : Math.min(100, Math.round((leadsUsed / leadLimit) * 100)),
      isOver: leadLimit != null && leadsUsed >= leadLimit,
      nearLimit: leadLimit != null && leadsUsed >= Math.floor(leadLimit * 0.8),
    },
    planName: plan.name,
    planKey: plan.key,
    subStatus: sub?.status ?? null,
  }
}

export type AccountIntelligence = {
  gradeDistribution: { grade: LeadGrade; count: number; pct: number }[]
  avgFit: number | null
  avgIntent: number | null
  avgQuality: number | null
  sqlCount: number
  missedCount: number
  atRiskValueInr: number
  junkCount: number
  duplicateCount: number
  intakeSessions: number
  intakeApproved: number
  scoreEvents: number
}

export async function getAccountIntelligence(accountId: string): Promise<AccountIntelligence> {
  const [byGrade, avgs, sqlCount, missed, junk, dupes, intakeTotal, intakeApproved, scoreEvents] = await Promise.all([
    prisma.lead.groupBy({ by: ["grade"], where: { account_id: accountId }, _count: { _all: true } }),
    prisma.lead.aggregate({
      where: { account_id: accountId },
      _avg: { fit_score: true, intent_score: true, quality_score: true },
    }),
    prisma.lead.count({ where: { account_id: accountId, is_sql: true } }),
    prisma.lead.aggregate({
      where: { account_id: accountId, is_missed: true }, _count: { _all: true }, _sum: { expected_value: true },
    }),
    prisma.lead.count({ where: { account_id: accountId, is_junk: true } }),
    prisma.lead.count({ where: { account_id: accountId, is_duplicate: true } }),
    prisma.intakeSession.count({ where: { account_id: accountId } }),
    prisma.intakeSession.count({ where: { account_id: accountId, state: { in: [IntakeState.APPROVED, IntakeState.IMPORTING, IntakeState.COMPLETED] } } }),
    prisma.leadScoreEvent.count({ where: { account_id: accountId } }),
  ])

  const total = byGrade.reduce((s, g) => s + g._count._all, 0)
  const round = (v: number | null) => (v == null ? null : Math.round(v))

  return {
    gradeDistribution: (["A", "B", "C", "D", "E", "F"] as LeadGrade[]).map((grade) => {
      const count = byGrade.find((g) => g.grade === grade)?._count._all ?? 0
      return { grade, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }
    }),
    avgFit: round(avgs._avg.fit_score),
    avgIntent: round(avgs._avg.intent_score),
    avgQuality: round(avgs._avg.quality_score),
    sqlCount,
    missedCount: missed._count._all,
    atRiskValueInr: missed._sum.expected_value ?? 0,
    junkCount: junk,
    duplicateCount: dupes,
    intakeSessions: intakeTotal,
    intakeApproved,
    scoreEvents,
  }
}

export type RepRow = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  assigned: number
  contacted: number
  won: number
  signals30d: number
  lastActiveAt: Date | null
  adoptedRecommendations: number
}

/** Per-user operating stats inside one account — the team roster with substance. */
export async function getAccountTeam(accountId: string): Promise<RepRow[]> {
  const d30 = new Date(Date.now() - 30 * DAY)
  const [users, assignedBy, contactedBy, wonBy, signalsBy, lastBy, adoptedBy] = await Promise.all([
    prisma.user.findMany({
      where: { account_id: accountId },
      select: { id: true, first_name: true, last_name: true, email: true, role: true, is_active: true },
      orderBy: [{ role: "asc" }, { first_name: "asc" }],
    }),
    prisma.lead.groupBy({ by: ["assigned_rep_id"], where: { account_id: accountId, assigned_rep_id: { not: null } }, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, assigned_rep_id: { not: null }, first_contact_at: { not: null } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, assigned_rep_id: { not: null }, won_at: { not: null } },
      _count: { _all: true },
    }),
    prisma.signal.groupBy({
      by: ["user_id"],
      where: { account_id: accountId, user_id: { not: null }, created_at: { gte: d30 }, signal_type: { not: "SOURCE_BASELINE" } },
      _count: { _all: true },
    }),
    prisma.signal.groupBy({ by: ["user_id"], where: { account_id: accountId, user_id: { not: null } }, _max: { created_at: true } }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, assigned_rep_id: { not: null }, first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N } },
      _count: { _all: true },
    }),
  ])

  const byRep = (rows: { assigned_rep_id: string | null; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.assigned_rep_id ?? "", r._count._all]))
  const byUser = (rows: { user_id: string | null; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.user_id ?? "", r._count._all]))

  const assigned = byRep(assignedBy)
  const contacted = byRep(contactedBy)
  const won = byRep(wonBy)
  const adopted = byRep(adoptedBy)
  const signals = byUser(signalsBy)
  const last = new Map(lastBy.map((r) => [r.user_id ?? "", r._max.created_at]))

  return users.map((u) => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name ?? ""}`.trim() || u.email,
    email: u.email,
    role: u.role,
    isActive: u.is_active,
    assigned: assigned.get(u.id) ?? 0,
    contacted: contacted.get(u.id) ?? 0,
    won: won.get(u.id) ?? 0,
    signals30d: signals.get(u.id) ?? 0,
    lastActiveAt: last.get(u.id) ?? null,
    adoptedRecommendations: adopted.get(u.id) ?? 0,
  }))
}
