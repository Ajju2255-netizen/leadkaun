// ─────────────────────────────────────────────
// GROWTH — activation, cohorts, acquisition (Mission Control)
//
// Two honest limits, stated here so the screens can state them too:
//
//  1. There is NO page-view or visitor tracking in this product. The funnel
//     therefore starts at "signed up", not at "visited". A CAC or a
//     visitor→signup rate would have to be invented, so neither is shown.
//
//  2. Attribution is whatever the register form captured
//     (accounts.signup_utm_source / _campaign / _country). Accounts that
//     arrived before that was captured, or with no UTM, are grouped as
//     "direct / unattributed" rather than silently dropped.
//
// "Activated" has one definition, shared with the Overview cockpit: the account
// completed an import AND logged at least one real (non-import) rep action.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { ImportStatus } from "@prisma/client"

const DAY = 86_400_000

export type FunnelRow = {
  label: string
  count: number
  pctOfTop: number
  dropPct: number | null
  hint: string
  /** Accounts that reached the PREVIOUS step but not this one. */
  stuck: { id: string; name: string; createdAt: Date }[]
}

/**
 * The activation funnel with, for each step, the accounts that fell out at
 * exactly that step. A funnel you can't click into is a poster, not a tool.
 */
export async function getActivationFunnel(): Promise<{ rows: FunnelRow[]; totalAccounts: number }> {
  const [accounts, icpIds, intakeIds, importIds, leadIds, recoIds, actionIds, paidIds] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true, created_at: true }, orderBy: { created_at: "desc" } }),
    prisma.account.findMany({ where: { icp_configured: true }, select: { id: true } }).then(ids),
    prisma.intakeSession.findMany({ distinct: ["account_id"], select: { account_id: true } }).then(acctIds),
    prisma.importJobStatus
      .findMany({ where: { status: ImportStatus.COMPLETE }, distinct: ["account_id"], select: { account_id: true } })
      .then(acctIds),
    prisma.lead.findMany({ distinct: ["account_id"], select: { account_id: true } }).then(acctIds),
    prisma.recommendationEvent
      .findMany({ where: { event: "SHOWN" }, distinct: ["account_id"], select: { account_id: true } })
      .then(acctIds),
    prisma.signal
      .findMany({ where: { signal_type: { not: "SOURCE_BASELINE" } }, distinct: ["account_id"], select: { account_id: true } })
      .then(acctIds),
    prisma.subscription.findMany({ where: { status: "active" }, select: { account_id: true } }).then(acctIds),
  ])

  const all = new Set(accounts.map((a) => a.id))
  const activated = new Set(Array.from(importIds).filter((id) => actionIds.has(id)))

  const steps: { label: string; set: Set<string>; hint: string }[] = [
    { label: "Signed up", set: all, hint: "Account rows. There is no visitor tracking, so the funnel starts here." },
    { label: "Configured ICP", set: icpIds, hint: "Until this is set, fit short-circuits to a flat 38 for every lead." },
    { label: "Started an intake", set: intakeIds, hint: "Uploaded a dataset and got an Import Intelligence Report." },
    { label: "Completed an import", set: importIds, hint: "An import job reached COMPLETE." },
    { label: "Has scored leads", set: leadIds, hint: "Lead rows exist; every one is graded on create." },
    { label: "Saw a recommendation", set: recoIds, hint: "A SHOWN recommendation event was recorded." },
    { label: "Took a first action", set: actionIds, hint: "A real call / WhatsApp / rep-override signal." },
    { label: "Activated", set: activated, hint: "Completed an import AND took a real action." },
    { label: "Paid", set: paidIds, hint: "An active subscription." },
  ]

  const top = steps[0].set.size || 1
  const byId = new Map(accounts.map((a) => [a.id, a]))

  const rows: FunnelRow[] = steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].set : s.set
    const stuck = i === 0
      ? []
      : Array.from(prev)
          .filter((id) => !s.set.has(id))
          .map((id) => byId.get(id))
          .filter((a): a is { id: string; name: string; created_at: Date } => !!a)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(0, 12)
          .map((a) => ({ id: a.id, name: a.name, createdAt: a.created_at }))

    return {
      label: s.label,
      count: s.set.size,
      pctOfTop: Math.round((s.set.size / top) * 100),
      dropPct: i > 0 && prev.size > 0 ? Math.round(((prev.size - s.set.size) / prev.size) * 100) : null,
      hint: s.hint,
      stuck,
    }
  })

  return { rows, totalAccounts: accounts.length }
}

const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))
const acctIds = (rows: { account_id: string | null }[]) =>
  new Set(rows.map((r) => r.account_id).filter((v): v is string => !!v))

// ── Cohorts ───────────────────────────────────────────────────────────────────

export type CohortRow = {
  key: string          // "2026-W31" style label
  label: string
  size: number
  /** Reached activation within N days OF SIGNING UP — not "in the last N days". */
  d1: number
  d7: number
  d30: number
  imported: number
  paid: number
  /** Still logging real actions in the last 14 days. */
  retained: number
  d7Pct: number | null
  d30Pct: number | null
  paidPct: number | null
}

/** Monday-anchored ISO-ish week label in IST. */
function weekKey(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000)
  const day = (ist.getUTCDay() + 6) % 7 // Mon = 0
  const monday = new Date(ist.getTime() - day * DAY)
  return monday.toISOString().slice(0, 10)
}

export async function getSignupCohorts(weeks = 12): Promise<CohortRow[]> {
  const since = new Date(Date.now() - weeks * 7 * DAY)
  const d14 = new Date(Date.now() - 14 * DAY)

  const [accounts, firstImports, firstActions, paid, recentActive] = await Promise.all([
    prisma.account.findMany({ where: { created_at: { gte: since } }, select: { id: true, created_at: true } }),
    prisma.importJobStatus.groupBy({
      by: ["account_id"], where: { status: ImportStatus.COMPLETE }, _min: { created_at: true },
    }),
    prisma.signal.groupBy({
      by: ["account_id"], where: { signal_type: { not: "SOURCE_BASELINE" } }, _min: { created_at: true },
    }),
    prisma.subscription.findMany({ where: { status: "active" }, select: { account_id: true } }).then(acctIds),
    prisma.signal
      .findMany({
        where: { signal_type: { not: "SOURCE_BASELINE" }, created_at: { gte: d14 } },
        distinct: ["account_id"], select: { account_id: true },
      })
      .then(acctIds),
  ])

  const importAt = new Map(firstImports.map((r) => [r.account_id, r._min.created_at]))
  const actionAt = new Map(firstActions.map((r) => [r.account_id, r._min.created_at]))

  const buckets = new Map<string, CohortRow>()
  for (const a of accounts) {
    const key = weekKey(a.created_at)
    const row = buckets.get(key) ?? {
      key, label: key, size: 0, d1: 0, d7: 0, d30: 0,
      imported: 0, paid: 0, retained: 0, d7Pct: null, d30Pct: null, paidPct: null,
    }
    row.size++

    const imp = importAt.get(a.id) ?? null
    const act = actionAt.get(a.id) ?? null
    if (imp) row.imported++
    if (paid.has(a.id)) row.paid++
    if (recentActive.has(a.id)) row.retained++

    // Activation = both events happened; the clock runs from signup to the LATER of the two.
    if (imp && act) {
      const activatedAt = Math.max(imp.getTime(), act.getTime())
      const elapsedDays = (activatedAt - a.created_at.getTime()) / DAY
      if (elapsedDays <= 1) row.d1++
      if (elapsedDays <= 7) row.d7++
      if (elapsedDays <= 30) row.d30++
    }
    buckets.set(key, row)
  }

  return Array.from(buckets.values())
    .map((r) => ({
      ...r,
      d7Pct: r.size > 0 ? Math.round((r.d7 / r.size) * 100) : null,
      d30Pct: r.size > 0 ? Math.round((r.d30 / r.size) * 100) : null,
      paidPct: r.size > 0 ? Math.round((r.paid / r.size) * 100) : null,
    }))
    .sort((a, b) => b.key.localeCompare(a.key))
}

// ── Acquisition ───────────────────────────────────────────────────────────────

export type AcquisitionRow = {
  key: string
  label: string
  signups: number
  imported: number
  activated: number
  paid: number
  mrrInr: number
  activationPct: number | null
  paidPct: number | null
}

export type Acquisition = {
  bySource: AcquisitionRow[]
  byCampaign: AcquisitionRow[]
  byCountry: { key: string; label: string; count: number; pct: number }[]
  attributed: number
  unattributed: number
  total: number
}

export async function getAcquisition(): Promise<Acquisition> {
  const [accounts, importIds, actionIds, subs] = await Promise.all([
    prisma.account.findMany({
      select: { id: true, signup_utm_source: true, signup_utm_campaign: true, signup_country: true },
    }),
    prisma.importJobStatus
      .findMany({ where: { status: ImportStatus.COMPLETE }, distinct: ["account_id"], select: { account_id: true } })
      .then(acctIds),
    prisma.signal
      .findMany({ where: { signal_type: { not: "SOURCE_BASELINE" } }, distinct: ["account_id"], select: { account_id: true } })
      .then(acctIds),
    prisma.subscription.findMany({ where: { status: "active" }, select: { account_id: true, mrr_inr: true } }),
  ])

  const mrrByAccount = new Map(subs.map((s) => [s.account_id, Math.round(s.mrr_inr / 100)]))

  function group(pick: (a: (typeof accounts)[number]) => string | null, fallback: string): AcquisitionRow[] {
    const map = new Map<string, AcquisitionRow>()
    for (const a of accounts) {
      const raw = pick(a)
      const key = raw && raw.trim() ? raw.trim() : fallback
      const row = map.get(key) ?? {
        key, label: key, signups: 0, imported: 0, activated: 0, paid: 0,
        mrrInr: 0, activationPct: null, paidPct: null,
      }
      row.signups++
      if (importIds.has(a.id)) row.imported++
      if (importIds.has(a.id) && actionIds.has(a.id)) row.activated++
      if (mrrByAccount.has(a.id)) { row.paid++; row.mrrInr += mrrByAccount.get(a.id) ?? 0 }
      map.set(key, row)
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        activationPct: r.signups > 0 ? Math.round((r.activated / r.signups) * 100) : null,
        paidPct: r.signups > 0 ? Math.round((r.paid / r.signups) * 100) : null,
      }))
      .sort((a, b) => b.signups - a.signups)
  }

  const countryMap = new Map<string, number>()
  for (const a of accounts) {
    const k = a.signup_country?.trim() || "Unknown"
    countryMap.set(k, (countryMap.get(k) ?? 0) + 1)
  }
  const total = accounts.length
  const attributed = accounts.filter((a) => a.signup_utm_source?.trim()).length

  return {
    bySource: group((a) => a.signup_utm_source, "Direct / unattributed"),
    byCampaign: group((a) => a.signup_utm_campaign, "No campaign"),
    byCountry: Array.from(countryMap.entries())
      .map(([key, count]) => ({ key, label: key, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count),
    attributed,
    unattributed: total - attributed,
    total,
  }
}
