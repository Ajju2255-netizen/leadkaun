// ─────────────────────────────────────────────
// OVERVIEW — the Mission Control cockpit
//
// One screen that answers, in ten seconds: is Leadkaun healthy, are customers
// using it, is the intelligence working, is anything broken, where do I need to
// intervene?
//
// Two rules the whole file obeys:
//   1. Every KPI carries its own definition (the `hint` rendered next to it).
//      "Activated" means one specific, stated thing — not a vibe.
//   2. Attention items are computed from real thresholds and each states its
//      evidence. Nothing appears in that list without a number behind it.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { startOfIstDay } from "@/lib/time/ist"
import { getRecommendationHeadline, type RecoCounts, type RecoRates } from "@/lib/admin/recommendations"
import { getIntakeSummary, type IntakeSummary } from "@/lib/admin/intake"
import { getJobHealth } from "@/lib/admin/ops"
import { ACTIVE_LEAD } from "@/lib/billing/lead-usage"
import { OCCUPIES_SEAT } from "@/lib/billing/seats"
import { ImportStatus, type Prisma } from "@prisma/client"

const DAY = 86_400_000

export type Severity = "info" | "warn" | "critical"

export type AttentionItem = {
  label: string
  count: number
  severity: Severity
  href?: string
  /** The evidence — what was measured, over what window. */
  why: string
}

export type OverviewKpis = {
  accounts: number
  activeWorkspaces: number
  newSignups7d: number
  activated: number
  activeLeads: number
  totalLeads: number
  recommendationsShown30d: number
  rar: number | null
  mrrInr: number
}

export type FunnelRow = { label: string; count: number; pctOfTop: number; dropPct: number | null; href?: string; hint: string }

export type HealthDistribution = { healthy: number; warning: number; critical: number; total: number }

export type Overview = {
  kpis: OverviewKpis
  health: {
    db: boolean
    imports: boolean | null
    scoring: boolean | null
    recommendations: boolean | null
    email: boolean | null
    jobs: boolean | null
    intake: boolean | null
  }
  jobsDelayed: number
  attention: AttentionItem[]
  activation: FunnelRow[]
  intelligence: { counts: RecoCounts; rates: RecoRates; rarDeltaPts: number | null; isEmpty: boolean }
  intake: IntakeSummary
  healthDistribution: HealthDistribution
  today: { signups: number; imports: number; leadsImported: number; emails: number; intakeSessions: number; activeAccounts: number }
}

// Distinct account ids matching a filter, as a Set. `distinct` + a
// single-column select is the portable way to get this without a raw query, and
// only account ids come back over the wire.
const toSet = (rows: { account_id: string | null }[]) =>
  new Set(rows.map((r) => r.account_id).filter((v): v is string => !!v))

const SELECT_ACCT = { account_id: true } as const
// Not `as const` — Prisma's distinct arg is a mutable array type.
const DISTINCT_ACCT: "account_id"[] = ["account_id"]

const accountsWithSignal = (where: Prisma.SignalWhereInput) =>
  prisma.signal.findMany({ where, distinct: DISTINCT_ACCT, select: SELECT_ACCT }).then(toSet)

const accountsWithLead = (where: Prisma.LeadWhereInput) =>
  prisma.lead.findMany({ where, distinct: DISTINCT_ACCT, select: SELECT_ACCT }).then(toSet)

const accountsWithImport = (where: Prisma.ImportJobStatusWhereInput) =>
  prisma.importJobStatus.findMany({ where, distinct: DISTINCT_ACCT, select: SELECT_ACCT }).then(toSet)

const accountsWithIntakeSession = (where: Prisma.IntakeSessionWhereInput) =>
  prisma.intakeSession.findMany({ where, distinct: DISTINCT_ACCT, select: SELECT_ACCT }).then(toSet)

const accountsWithRecoEvent = (where: Prisma.RecommendationEventWhereInput) =>
  prisma.recommendationEvent.findMany({ where, distinct: DISTINCT_ACCT, select: SELECT_ACCT }).then(toSet)

export async function getOverview(): Promise<Overview> {
  const dayStart = startOfIstDay()
  const d7 = new Date(Date.now() - 7 * DAY)
  const d14 = new Date(Date.now() - 14 * DAY)

  const [
    accounts, activeWorkspaces, newSignups7d, totalLeads, activeLeads,
    mrrAgg, dbOk,
    signupsToday, importsToday, leadsImportedToday, emailsToday, emailsFailedToday, intakeToday,
    activeAccountsToday,
    accountsImported, accountsWithLeads, accountsWithIntake, accountsShownReco, accountsActed, accountsRetained,
    accountsIcp, paidAccounts,
    jobs, recoHeadline, intake,
    failedImports7d, notOnboarded, scoringRecent, recoRecent,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.workspace.count({ where: { archived_at: null } }),
    prisma.account.count({ where: { created_at: { gte: d7 } } }),
    prisma.lead.count(),
    prisma.lead.count({ where: ACTIVE_LEAD }),
    prisma.subscription.aggregate({ where: { status: "active" }, _sum: { mrr_inr: true } }),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),

    prisma.account.count({ where: { created_at: { gte: dayStart } } }),
    prisma.importJobStatus.count({ where: { created_at: { gte: dayStart } } }),
    prisma.importJobStatus.aggregate({ where: { created_at: { gte: dayStart } }, _sum: { inserted: true } }),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "sent" } }),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "failed" } }),
    prisma.intakeSession.count({ where: { created_at: { gte: dayStart } } }),
    accountsWithSignal({ created_at: { gte: dayStart } }),

    accountsWithImport({ status: ImportStatus.COMPLETE }),
    accountsWithLead({}),
    accountsWithIntakeSession({}),
    accountsWithRecoEvent({ event: "SHOWN" }),
    // A REAL action — import-time signals don't count as the customer doing something.
    accountsWithSignal({ signal_type: { not: "SOURCE_BASELINE" } }),
    accountsWithSignal({ signal_type: { not: "SOURCE_BASELINE" }, created_at: { gte: d14 } }),
    prisma.account.count({ where: { icp_configured: true } }),
    prisma.subscription.count({ where: { status: "active" } }),

    getJobHealth(),
    getRecommendationHeadline(30),
    getIntakeSummary(30),

    prisma.importJobStatus.count({ where: { status: ImportStatus.FAILED, created_at: { gte: d7 } } }),
    // Accounts with no completed import at all.
    prisma.account.count(),
    prisma.leadScoreEvent.count({ where: { occurred_at: { gte: d7 } } }),
    prisma.recommendationEvent.count({ where: { created_at: { gte: d7 } } }),
  ])

  // "Activated" = imported leads AND logged at least one real rep action.
  const activatedSet = new Set(Array.from(accountsImported).filter((id) => accountsActed.has(id)))

  const attention = await buildAttention({
    failedImports7d,
    notOnboardedCount: Math.max(0, notOnboarded - accountsImported.size),
    emailsFailedToday,
    jobsDelayed: jobs.filter((j) => j.healthy === false).length,
    rarDeltaPts: recoHeadline.rarDeltaPts,
    intake,
    d14,
  })

  const funnel = buildActivationFunnel({
    accounts,
    icp: accountsIcp,
    intake: accountsWithIntake.size,
    imported: accountsImported.size,
    scored: accountsWithLeads.size,
    recommended: accountsShownReco.size,
    acted: accountsActed.size,
    activated: activatedSet.size,
    retained: accountsRetained.size,
    paid: paidAccounts,
  })

  return {
    kpis: {
      accounts,
      activeWorkspaces,
      newSignups7d,
      activated: activatedSet.size,
      activeLeads,
      totalLeads,
      recommendationsShown30d: recoHeadline.counts.shown,
      rar: recoHeadline.rates.rar,
      mrrInr: Math.round((mrrAgg._sum.mrr_inr ?? 0) / 100),
    },
    health: {
      db: dbOk,
      imports: importsToday > 0 ? failedImports7d === 0 : null,
      scoring: scoringRecent > 0 ? true : null,
      recommendations: recoRecent > 0 ? true : null,
      email: emailsToday + emailsFailedToday > 0 ? emailsFailedToday === 0 : null,
      jobs: jobs.some((j) => j.healthy != null) ? jobs.every((j) => j.healthy !== false) : null,
      intake: intake.sessionsWindow > 0 ? intake.failedWindow === 0 && intake.stalled === 0 : null,
    },
    jobsDelayed: jobs.filter((j) => j.healthy === false).length,
    attention,
    activation: funnel,
    intelligence: recoHeadline,
    intake,
    healthDistribution: await getHealthDistribution(),
    today: {
      signups: signupsToday,
      imports: importsToday,
      leadsImported: leadsImportedToday._sum.inserted ?? 0,
      emails: emailsToday,
      intakeSessions: intakeToday,
      activeAccounts: activeAccountsToday.size,
    },
  }
}

// ── Attention Required ────────────────────────────────────────────────────────

async function buildAttention(input: {
  failedImports7d: number
  notOnboardedCount: number
  emailsFailedToday: number
  jobsDelayed: number
  rarDeltaPts: number | null
  intake: IntakeSummary
  d14: Date
}): Promise<AttentionItem[]> {
  const out: AttentionItem[] = []

  // Paying but silent — the single most expensive thing on this page.
  const [payingSubs, activeAccounts14] = await Promise.all([
    prisma.subscription.findMany({ where: { status: "active" }, select: { account_id: true } }),
    accountsWithSignal({ signal_type: { not: "SOURCE_BASELINE" }, created_at: { gte: input.d14 } }),
  ])
  const churnRisk = payingSubs.filter((s) => !activeAccounts14.has(s.account_id)).length
  if (churnRisk > 0) {
    out.push({
      label: `${churnRisk} paying account${churnRisk === 1 ? "" : "s"} with no rep activity in 14 days`,
      count: churnRisk, severity: "critical", href: "/accounts?health=critical",
      why: "Active subscription, zero non-import signals in the last 14 days.",
    })
  }

  // Plan-limit pressure — computed against each plan's real active-lead cap.
  const nearLimit = await accountsNearLeadLimit()
  if (nearLimit.length > 0) {
    const over = nearLimit.filter((a) => a.pct >= 100).length
    out.push({
      label: over > 0
        ? `${over} account${over === 1 ? "" : "s"} at their lead limit, ${nearLimit.length - over} approaching`
        : `${nearLimit.length} account${nearLimit.length === 1 ? "" : "s"} approaching their lead limit`,
      count: nearLimit.length, severity: over > 0 ? "critical" : "warn", href: "/billing/usage",
      why: "Active (open) leads at or above 80% of the plan's active_lead_limit. New leads are blocked at 100%.",
    })
  }

  const seatFull = await accountsAtSeatLimit()
  if (seatFull > 0) {
    out.push({
      label: `${seatFull} account${seatFull === 1 ? "" : "s"} out of seats`,
      count: seatFull, severity: "warn", href: "/billing/usage",
      why: "Occupied seats (active users + pending invites) have reached the plan's max_seats — invites will 409.",
    })
  }

  if (input.failedImports7d > 0) {
    out.push({
      label: `${input.failedImports7d} import${input.failedImports7d === 1 ? "" : "s"} failed this week`,
      count: input.failedImports7d, severity: "critical", href: "/ops/errors",
      why: "import_job_status rows with status=FAILED in the last 7 days. Row-level skips are counted separately.",
    })
  }

  if (input.intake.stalled > 0) {
    out.push({
      label: `${input.intake.stalled} intake session${input.intake.stalled === 1 ? "" : "s"} stuck mid-machine`,
      count: input.intake.stalled, severity: "warn", href: "/intake",
      why: "Still in CREATED / ANALYSING / IMPORTING with no update for over 2 hours.",
    })
  }

  if (input.intake.failedWindow > 0) {
    out.push({
      label: `${input.intake.failedWindow} intake session${input.intake.failedWindow === 1 ? "" : "s"} failed`,
      count: input.intake.failedWindow, severity: "warn", href: "/intake?state=FAILED",
      why: `Sessions in state FAILED over the last ${input.intake.windowDays} days.`,
    })
  }

  if (input.notOnboardedCount > 0) {
    out.push({
      label: `${input.notOnboardedCount} account${input.notOnboardedCount === 1 ? "" : "s"} haven't completed an import`,
      count: input.notOnboardedCount, severity: "warn", href: "/growth/activation",
      why: "No import_job_status row with status=COMPLETE — they have never got leads into the product.",
    })
  }

  if (input.rarDeltaPts != null && input.rarDeltaPts <= -2) {
    out.push({
      label: `Recommendation acceptance down ${Math.abs(input.rarDeltaPts)} pts`,
      count: 1, severity: "critical", href: "/recommendations",
      why: "RAR (ACCEPTED / SHOWN) over the last 30 days vs the 30 days before it.",
    })
  }

  if (input.jobsDelayed > 0) {
    out.push({
      label: `${input.jobsDelayed} background job${input.jobsDelayed === 1 ? "" : "s"} delayed or failing`,
      count: input.jobsDelayed, severity: "critical", href: "/ops/jobs",
      why: "Last run failed, or the gap since the last run exceeds that function's own schedule.",
    })
  }

  if (input.emailsFailedToday > 0) {
    out.push({
      label: `${input.emailsFailedToday} email${input.emailsFailedToday === 1 ? "" : "s"} failed today`,
      count: input.emailsFailedToday, severity: "warn", href: "/system",
      why: "email_logs with status=failed since 00:00 IST — usually an unverified sending domain or a bounce.",
    })
  }

  const sheetsFailing = await prisma.sheetSync.count({
    where: { is_active: true, last_status: { not: null, notIn: ["ok"] } },
  })
  if (sheetsFailing > 0) {
    out.push({
      label: `${sheetsFailing} Google Sheets connection${sheetsFailing === 1 ? "" : "s"} erroring`,
      count: sheetsFailing, severity: "warn", href: "/ops/integrations",
      why: "sheet_syncs rows that are active but whose last_status is not 'ok' — usually revoked sharing.",
    })
  }

  const severityRank: Record<Severity, number> = { critical: 0, warn: 1, info: 2 }
  out.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count)
  return out
}

export type LeadLimitRow = { accountId: string; accountName: string; used: number; limit: number; pct: number; planName: string }

/** Accounts at ≥80% of their plan's active-lead cap. Unlimited plans excluded. */
export async function accountsNearLeadLimit(threshold = 0.8): Promise<LeadLimitRow[]> {
  const [counts, subs, trialPlan] = await Promise.all([
    prisma.lead.groupBy({ by: ["account_id"], where: ACTIVE_LEAD, _count: { _all: true } }),
    prisma.subscription.findMany({
      select: { account_id: true, status: true, plan: { select: { name: true, active_lead_limit: true } } },
    }),
    prisma.plan.findUnique({ where: { key: "trial" }, select: { name: true, active_lead_limit: true } }),
  ])
  if (counts.length === 0) return []

  const subMap = new Map(subs.map((s) => [s.account_id, s]))
  const names = new Map(
    (await prisma.account.findMany({
      where: { id: { in: counts.map((c) => c.account_id) } },
      select: { id: true, name: true },
    })).map((a) => [a.id, a.name]),
  )

  const rows: LeadLimitRow[] = []
  for (const c of counts) {
    const sub = subMap.get(c.account_id)
    // Mirrors lib/billing/lead-usage.ts: no sub, or a cancelled one, falls back to Free.
    const plan = sub && sub.status !== "canceled" ? sub.plan : trialPlan
    const limit = plan?.active_lead_limit
    if (limit == null || limit <= 0) continue // unlimited
    const used = c._count._all
    if (used < limit * threshold) continue
    rows.push({
      accountId: c.account_id,
      accountName: names.get(c.account_id) ?? "(deleted account)",
      used, limit,
      pct: Math.round((used / limit) * 100),
      planName: plan?.name ?? "Free",
    })
  }
  return rows.sort((a, b) => b.pct - a.pct)
}

async function accountsAtSeatLimit(): Promise<number> {
  const [seatCounts, subs, trialPlan] = await Promise.all([
    prisma.user.groupBy({ by: ["account_id"], where: OCCUPIES_SEAT, _count: { _all: true } }),
    prisma.subscription.findMany({ select: { account_id: true, status: true, plan: { select: { max_seats: true } } } }),
    prisma.plan.findUnique({ where: { key: "trial" }, select: { max_seats: true } }),
  ])
  const subMap = new Map(subs.map((s) => [s.account_id, s]))
  let n = 0
  for (const c of seatCounts) {
    const sub = subMap.get(c.account_id)
    const max = (sub && sub.status !== "canceled" ? sub.plan.max_seats : trialPlan?.max_seats) ?? 1
    if (c._count._all >= max) n++
  }
  return n
}

// ── Activation funnel ─────────────────────────────────────────────────────────

function buildActivationFunnel(n: {
  accounts: number; icp: number; intake: number; imported: number; scored: number
  recommended: number; acted: number; activated: number; retained: number; paid: number
}): FunnelRow[] {
  const steps: { label: string; count: number; href?: string; hint: string }[] = [
    { label: "Signed up",            count: n.accounts,    href: "/accounts", hint: "Account rows." },
    { label: "Configured ICP",       count: n.icp,         hint: "accounts.icp_configured = true — the scoring brain is set." },
    { label: "Started an intake",    count: n.intake,      href: "/intake", hint: "≥1 intake_session — they uploaded a dataset." },
    { label: "Completed an import",  count: n.imported,    hint: "≥1 import_job_status with status = COMPLETE." },
    { label: "Has scored leads",     count: n.scored,      hint: "≥1 lead row (every lead is scored on create)." },
    { label: "Saw a recommendation", count: n.recommended, href: "/recommendations", hint: "≥1 SHOWN recommendation_event." },
    { label: "Took a first action",  count: n.acted,       hint: "≥1 signal that isn't SOURCE_BASELINE — a real call/WhatsApp/override." },
    { label: "Activated",            count: n.activated,   hint: "Completed an import AND took a real action. This is the activation event." },
    { label: "Retained (14d)",       count: n.retained,    hint: "A real action in the last 14 days." },
    { label: "Paid",                 count: n.paid,        href: "/billing", hint: "Subscription with status = active." },
  ]

  const top = steps[0].count || 1
  return steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].count : s.count
    return {
      label: s.label,
      count: s.count,
      pctOfTop: Math.round((s.count / top) * 100),
      dropPct: i > 0 && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null,
      href: s.href,
      hint: s.hint,
    }
  })
}

// ── Health distribution ───────────────────────────────────────────────────────

/**
 * The same cheap band the Accounts list uses (recency + has-leads), so the
 * cockpit total always reconciles with the table. The full weighted score is
 * per-account and lives on the Account 360.
 */
export async function getHealthDistribution(): Promise<HealthDistribution> {
  const [accounts, lastBy, leadsBy] = await Promise.all([
    prisma.account.count(),
    prisma.signal.groupBy({ by: ["account_id"], _max: { created_at: true } }),
    prisma.lead.groupBy({ by: ["account_id"], _count: { _all: true } }),
  ])
  const lastMap = new Map(lastBy.map((r) => [r.account_id, r._max.created_at]))
  const leadMap = new Map(leadsBy.map((r) => [r.account_id, r._count._all]))

  let healthy = 0, warning = 0, critical = 0
  const ids = new Set(Array.from(lastMap.keys()).concat(Array.from(leadMap.keys())))
  ids.forEach((id) => {
    const band = quickBand(leadMap.get(id) ?? 0, lastMap.get(id) ?? null)
    if (band === "healthy") healthy++
    else if (band === "warning") warning++
    else critical++
  })
  // Accounts with neither leads nor signals never appear in either groupBy.
  critical += Math.max(0, accounts - ids.size)

  return { healthy, warning, critical, total: accounts }
}

export function quickBand(leads: number, lastActiveAt: Date | null): "healthy" | "warning" | "critical" {
  if (leads === 0) return "critical"
  if (!lastActiveAt) return "critical"
  const days = (Date.now() - new Date(lastActiveAt).getTime()) / DAY
  if (days <= 7) return "healthy"
  if (days <= 14) return "warning"
  return "critical"
}
