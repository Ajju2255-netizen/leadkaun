// ─────────────────────────────────────────────
// SIGNAL EXPLORER (Mission Control)
//
// The debugging window into the intelligence engine. A signal is one piece of
// engagement evidence; intent is the running sum minus decay. Every row here
// carries the intent BEFORE and AFTER it landed, so a wrong intent score can be
// traced to the exact signal that caused it.
//
// The configured weight from SIGNAL_WEIGHTS is shown alongside the value that
// was actually written, because they can legitimately differ — decay writes a
// computed per-day delta, and the clamp to [source_baseline, 100] can absorb
// part of a signal.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { SIGNAL_WEIGHTS } from "@/lib/scoring/signal-weights"
import type { Prisma, SignalType, LeadGrade } from "@prisma/client"

export type SignalRow = {
  id: string
  type: SignalType
  value: number
  configuredWeight: number | null
  before: number
  after: number
  /** after − before. Differs from `value` when the clamp absorbed part of it. */
  applied: number
  gradeAt: LeadGrade
  at: Date
  leadId: string
  leadName: string
  accountId: string
  accountName: string
  actor: string | null
}

export type SignalFilters = {
  type?: SignalType
  accountId?: string
  leadId?: string
  days?: number
  /** Only signals whose applied delta differs from the written value. */
  clamped?: boolean
  take?: number
}

export type SignalTypeStat = {
  type: SignalType
  count: number
  configuredWeight: number | null
  avgValue: number
  avgApplied: number | null
  pct: number
}

export type SignalExplorer = {
  rows: SignalRow[]
  truncated: boolean
  types: SignalTypeStat[]
  total: number
  windowDays: number
  /** Signals whose written value doesn't match the configured weight. */
  offWeight: number
}

const weightOf = (t: string): number | null => {
  const w = (SIGNAL_WEIGHTS as Record<string, number | undefined>)[t]
  return typeof w === "number" ? w : null
}

export async function getSignalExplorer(f: SignalFilters = {}): Promise<SignalExplorer> {
  const days = f.days ?? 30
  const since = new Date(Date.now() - days * 86_400_000)

  const where: Prisma.SignalWhereInput = { created_at: { gte: since } }
  if (f.type) where.signal_type = f.type
  if (f.accountId) where.account_id = f.accountId
  if (f.leadId) where.lead_id = f.leadId

  const take = Math.min(300, f.take ?? 150)

  const [rows, byType, total] = await Promise.all([
    prisma.signal.findMany({
      where, orderBy: { created_at: "desc" }, take: take + 1,
      select: {
        id: true, signal_type: true, signal_value: true,
        intent_score_before: true, intent_score_after: true, lead_grade_at_signal: true,
        created_at: true, lead_id: true, account_id: true,
        lead: { select: { first_name: true, last_name: true } },
        user: { select: { first_name: true, last_name: true } },
      },
    }),
    prisma.signal.groupBy({
      by: ["signal_type"], where, _count: { _all: true }, _avg: { signal_value: true },
    }),
    prisma.signal.count({ where }),
  ])

  const accountIds = Array.from(new Set(rows.map((r) => r.account_id)))
  const names = new Map(
    (await prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } }))
      .map((a) => [a.id, a.name]),
  )

  const truncated = rows.length > take
  let mapped: SignalRow[] = rows.slice(0, take).map((s) => ({
    id: s.id,
    type: s.signal_type,
    value: s.signal_value,
    configuredWeight: weightOf(s.signal_type),
    before: s.intent_score_before,
    after: s.intent_score_after,
    applied: s.intent_score_after - s.intent_score_before,
    gradeAt: s.lead_grade_at_signal,
    at: s.created_at,
    leadId: s.lead_id,
    leadName: `${s.lead.first_name} ${s.lead.last_name ?? ""}`.trim(),
    accountId: s.account_id,
    accountName: names.get(s.account_id) ?? "(deleted account)",
    actor: s.user ? `${s.user.first_name} ${s.user.last_name ?? ""}`.trim() : null,
  }))

  if (f.clamped) mapped = mapped.filter((r) => r.applied !== r.value)

  const offWeight = mapped.filter(
    (r) => r.configuredWeight != null && r.value !== r.configuredWeight,
  ).length

  return {
    rows: mapped,
    truncated,
    total,
    windowDays: days,
    offWeight,
    types: byType
      .map((t) => ({
        type: t.signal_type,
        count: t._count._all,
        configuredWeight: weightOf(t.signal_type),
        avgValue: Math.round((t._avg.signal_value ?? 0) * 10) / 10,
        avgApplied: null,
        pct: total > 0 ? Math.round((t._count._all / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count),
  }
}

/** Every signal type the engine knows about, for the filter dropdown. */
export function allSignalTypes(): { value: string; label: string }[] {
  return Object.keys(SIGNAL_WEIGHTS)
    .sort()
    .map((k) => ({ value: k, label: `${k.replace(/_/g, " ")} (${weightOf(k)})` }))
}
