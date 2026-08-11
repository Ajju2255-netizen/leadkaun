// ─────────────────────────────────────────────
// RECOMMENDATION INTELLIGENCE — cross-account (Mission Control)
//
// The per-workspace version of this lives at /api/analytics/recommendations.
// This is the platform-wide read: the same funnel with all tenant scoping
// dropped, plus the things only we should see — the period-over-period RAR
// trend, per-grade and per-confidence-band acceptance, the failure breakdown,
// and which accounts trust the recommendations least.
//
// Definitions (kept identical to the customer-facing route so the numbers never
// disagree):
//   RAR                 = ACCEPTED / SHOWN
//   Expand rate         = EXPANDED / SHOWN
//   Accept of decided   = ACCEPTED / (ACCEPTED + IGNORED)
//   Execution rate      = EXECUTED / ACCEPTED
//   Positive outcome    = OUTCOME(result=won) / OUTCOME
//
// Every rate returns null when its denominator is 0 — an unmeasured metric is
// never rendered as 0%.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import type { Prisma, RecommendationSkipReason } from "@prisma/client"

export const SKIP_LABELS: Record<RecommendationSkipReason, string> = {
  ALREADY_DOING_IT:     "Already doing it",
  WRONG_RECOMMENDATION: "Wrong recommendation",
  NEED_MORE_INFO:       "Need more information",
  NOT_RELEVANT:         "Not relevant",
  OTHER:                "Other",
}

/** One-decimal percentage, or null when there's no denominator yet. */
export function rate(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null
}

export type RecoCounts = {
  shown: number
  expanded: number
  accepted: number
  ignored: number
  dismissed: number
  executed: number
  outcome: number
}

export type RecoRates = {
  rar: number | null
  expandRate: number | null
  acceptOfDecided: number | null
  executionRate: number | null
  positiveOutcomeRate: number | null
}

export type SkipRow = { reason: RecommendationSkipReason; label: string; count: number; pct: number | null }

export type RecoSlice = { key: string; shown: number; accepted: number; ignored: number; rar: number | null }

export type RecoAccountRow = {
  accountId: string
  accountName: string
  shown: number
  accepted: number
  ignored: number
  rar: number | null
  expandRate: number | null
}

export type RecommendationIntelligence = {
  windowDays: number
  counts: RecoCounts
  rates: RecoRates
  /** RAR over the immediately-preceding window of equal length, + the delta. */
  previousRar: number | null
  rarDeltaPts: number | null
  outcomeWon: number
  outcomeLost: number
  skipReasons: SkipRow[]
  byGrade: RecoSlice[]
  byConfidence: RecoSlice[]
  /** Skip reason × grade — where a particular failure concentrates. */
  failureByGrade: { reason: RecommendationSkipReason; label: string; grades: Record<string, number>; total: number }[]
  accounts: RecoAccountRow[]
  /** No telemetry at all in the window — the UI says "nothing shown yet", not "0%". */
  isEmpty: boolean
}

const EVENTS = ["SHOWN", "EXPANDED", "ACCEPTED", "IGNORED", "DISMISSED", "EXECUTED", "OUTCOME"] as const

function emptyCounts(): RecoCounts {
  return { shown: 0, expanded: 0, accepted: 0, ignored: 0, dismissed: 0, executed: 0, outcome: 0 }
}

function countsFrom(rows: { event: string; _count: { _all: number } }[]): RecoCounts {
  const get = (e: string) => rows.find((r) => r.event === e)?._count._all ?? 0
  return {
    shown:     get("SHOWN"),
    expanded:  get("EXPANDED"),
    accepted:  get("ACCEPTED"),
    ignored:   get("IGNORED"),
    dismissed: get("DISMISSED"),
    executed:  get("EXECUTED"),
    outcome:   get("OUTCOME"),
  }
}

export function ratesFrom(c: RecoCounts, outcomeWon: number): RecoRates {
  return {
    rar:                 rate(c.accepted, c.shown),
    expandRate:          rate(c.expanded, c.shown),
    acceptOfDecided:     rate(c.accepted, c.accepted + c.ignored),
    executionRate:       rate(c.executed, c.accepted),
    positiveOutcomeRate: rate(outcomeWon, c.outcome),
  }
}

/**
 * The full cross-account picture. `accountId` narrows it to one tenant (used by
 * the Account 360's intelligence panel) — everything else is platform-wide.
 */
export async function getRecommendationIntelligence(
  windowDays = 30,
  accountId?: string,
): Promise<RecommendationIntelligence> {
  const days = Math.min(365, Math.max(1, Math.floor(windowDays)))
  const now = Date.now()
  const start = new Date(now - days * 86_400_000)
  const prevStart = new Date(now - 2 * days * 86_400_000)

  const scope: Prisma.RecommendationEventWhereInput = accountId ? { account_id: accountId } : {}
  const where = { ...scope, created_at: { gte: start } }
  const prevWhere = { ...scope, created_at: { gte: prevStart, lt: start } }

  const [byEvent, prevByEvent, bySkip, byGradeRaw, byConfRaw, skipByGradeRaw, wonNow, lostNow] =
    await Promise.all([
      prisma.recommendationEvent.groupBy({ by: ["event"], where, _count: { _all: true } }),
      prisma.recommendationEvent.groupBy({ by: ["event"], where: prevWhere, _count: { _all: true } }),
      prisma.recommendationEvent.groupBy({
        by: ["skip_reason"], where: { ...where, event: "IGNORED" }, _count: { _all: true },
      }),
      prisma.recommendationEvent.groupBy({
        by: ["grade_at_event", "event"],
        where: { ...where, event: { in: ["SHOWN", "ACCEPTED", "IGNORED"] } },
        _count: { _all: true },
      }),
      prisma.recommendationEvent.groupBy({
        by: ["confidence_band", "event"],
        where: { ...where, event: { in: ["SHOWN", "ACCEPTED", "IGNORED"] } },
        _count: { _all: true },
      }),
      prisma.recommendationEvent.groupBy({
        by: ["skip_reason", "grade_at_event"],
        where: { ...where, event: "IGNORED" },
        _count: { _all: true },
      }),
      // OUTCOME carries the result in `detail` ({ result: "won" | "lost" }).
      prisma.recommendationEvent.count({
        where: { ...where, event: "OUTCOME", detail: { path: ["result"], equals: "won" } },
      }),
      prisma.recommendationEvent.count({
        where: { ...where, event: "OUTCOME", detail: { path: ["result"], equals: "lost" } },
      }),
    ])

  const counts = countsFrom(byEvent)
  const prevCounts = countsFrom(prevByEvent)
  const rates = ratesFrom(counts, wonNow)
  const previousRar = rate(prevCounts.accepted, prevCounts.shown)
  const rarDeltaPts =
    rates.rar != null && previousRar != null ? Math.round((rates.rar - previousRar) * 10) / 10 : null

  const skipReasons: SkipRow[] = (Object.keys(SKIP_LABELS) as RecommendationSkipReason[])
    .map((reason) => {
      const count = bySkip.find((r) => r.skip_reason === reason)?._count._all ?? 0
      return { reason, label: SKIP_LABELS[reason], count, pct: rate(count, counts.ignored) }
    })
    .sort((a, b) => b.count - a.count)

  // Fold the (dimension × event) groupBy into one row per dimension value.
  function fold(rows: { event: string; _count: { _all: number } }[], keyOf: (r: never) => string | null): RecoSlice[] {
    const map = new Map<string, { shown: number; accepted: number; ignored: number }>()
    for (const r of rows) {
      const key = keyOf(r as never) ?? "unknown"
      const cur = map.get(key) ?? { shown: 0, accepted: 0, ignored: 0 }
      if (r.event === "SHOWN") cur.shown += r._count._all
      if (r.event === "ACCEPTED") cur.accepted += r._count._all
      if (r.event === "IGNORED") cur.ignored += r._count._all
      map.set(key, cur)
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, rar: rate(v.accepted, v.shown) }))
      .sort((a, b) => b.shown - a.shown)
  }

  const byGrade = fold(byGradeRaw, (r: { grade_at_event: string | null }) => r.grade_at_event)
    .sort((a, b) => a.key.localeCompare(b.key))
  const byConfidence = fold(byConfRaw, (r: { confidence_band: string | null }) => r.confidence_band)

  const failureMap = new Map<RecommendationSkipReason, { grades: Record<string, number>; total: number }>()
  for (const r of skipByGradeRaw) {
    if (!r.skip_reason) continue
    const cur = failureMap.get(r.skip_reason) ?? { grades: {}, total: 0 }
    const g = r.grade_at_event ?? "?"
    cur.grades[g] = (cur.grades[g] ?? 0) + r._count._all
    cur.total += r._count._all
    failureMap.set(r.skip_reason, cur)
  }
  const failureByGrade = Array.from(failureMap.entries())
    .map(([reason, v]) => ({ reason, label: SKIP_LABELS[reason], grades: v.grades, total: v.total }))
    .sort((a, b) => b.total - a.total)

  const accounts = accountId ? [] : await accountLeaderboard(start)

  return {
    windowDays: days,
    counts,
    rates,
    previousRar,
    rarDeltaPts,
    outcomeWon: wonNow,
    outcomeLost: lostNow,
    skipReasons,
    byGrade,
    byConfidence,
    failureByGrade,
    accounts,
    isEmpty: EVENTS.every((e) => (byEvent.find((r) => r.event === e)?._count._all ?? 0) === 0),
  }
}

/** Per-account trust in the recommendations — lowest RAR first (who to look at). */
async function accountLeaderboard(start: Date): Promise<RecoAccountRow[]> {
  const rows = await prisma.recommendationEvent.groupBy({
    by: ["account_id", "event"],
    where: { created_at: { gte: start }, event: { in: ["SHOWN", "EXPANDED", "ACCEPTED", "IGNORED"] } },
    _count: { _all: true },
  })
  if (rows.length === 0) return []

  const map = new Map<string, { shown: number; expanded: number; accepted: number; ignored: number }>()
  for (const r of rows) {
    const cur = map.get(r.account_id) ?? { shown: 0, expanded: 0, accepted: 0, ignored: 0 }
    if (r.event === "SHOWN") cur.shown += r._count._all
    if (r.event === "EXPANDED") cur.expanded += r._count._all
    if (r.event === "ACCEPTED") cur.accepted += r._count._all
    if (r.event === "IGNORED") cur.ignored += r._count._all
    map.set(r.account_id, cur)
  }

  const names = new Map(
    (await prisma.account.findMany({
      where: { id: { in: Array.from(map.keys()) } },
      select: { id: true, name: true },
    })).map((a) => [a.id, a.name]),
  )

  return Array.from(map.entries())
    .map(([accountId, v]) => ({
      accountId,
      accountName: names.get(accountId) ?? "(deleted account)",
      shown: v.shown,
      accepted: v.accepted,
      ignored: v.ignored,
      rar: rate(v.accepted, v.shown),
      expandRate: rate(v.expanded, v.shown),
    }))
    // Enough volume to mean something first, then worst trust at the top.
    .sort((a, b) => (b.shown >= 10 ? 1 : 0) - (a.shown >= 10 ? 1 : 0) || (a.rar ?? 101) - (b.rar ?? 101))
}

/** Just the headline numbers, for the Overview cockpit. */
export async function getRecommendationHeadline(windowDays = 30): Promise<{
  counts: RecoCounts
  rates: RecoRates
  rarDeltaPts: number | null
  isEmpty: boolean
}> {
  const now = Date.now()
  const start = new Date(now - windowDays * 86_400_000)
  const prevStart = new Date(now - 2 * windowDays * 86_400_000)

  const [byEvent, prevByEvent, won] = await Promise.all([
    prisma.recommendationEvent.groupBy({ by: ["event"], where: { created_at: { gte: start } }, _count: { _all: true } }),
    prisma.recommendationEvent.groupBy({
      by: ["event"], where: { created_at: { gte: prevStart, lt: start } }, _count: { _all: true },
    }),
    prisma.recommendationEvent.count({
      where: { created_at: { gte: start }, event: "OUTCOME", detail: { path: ["result"], equals: "won" } },
    }),
  ])

  const counts = byEvent.length ? countsFrom(byEvent) : emptyCounts()
  const prev = countsFrom(prevByEvent)
  const rates = ratesFrom(counts, won)
  const previousRar = rate(prev.accepted, prev.shown)
  return {
    counts,
    rates,
    rarDeltaPts: rates.rar != null && previousRar != null ? Math.round((rates.rar - previousRar) * 10) / 10 : null,
    isEmpty: counts.shown === 0,
  }
}
