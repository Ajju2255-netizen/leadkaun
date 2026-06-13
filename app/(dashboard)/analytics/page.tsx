"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import {
  TrendingDown, TrendingUp, Minus, CheckCircle2,
  Zap, AlertTriangle, PhoneOff, Snowflake,
  BarChart3, Target, Clock, IndianRupee, ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { useHasRole } from "@/hooks/useCurrentUser"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDuration } from "@/lib/format"

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntelData {
  loss_reasons:       { reason: string; count: number; value: number; pct: number }[]
  grade_missed:       { grade: string; count: number; value: number }[]
  total_missed_count: number
  total_missed_value: number
  follow_up_gap_value: number
  patterns: {
    avg_speed_won:    number | null
    avg_speed_missed: number | null
    speed_insight:    string | null
  }
  prediction: {
    weekly_missed_value: number
    recovery_potential:  number
    days: { date: string; missed_value: number; missed_count: number }[]
  }
  source_performance: {
    id: string; name: string
    total_leads: number; won_count: number; missed_count: number
    conversion_rate: number; miss_rate: number; avg_intent: number
  }[]
  rep_performance: {
    id: string; first_name: string; last_name: string | null
    assigned: number; won_count: number; won_value: number
    missed_count: number; missed_value: number
    speed_to_lead: number | null
    a_grade_total: number; a_grade_contacted: number
    conversion_rate: number | null
  }[]
  follow_up_configs: { grade: string; first_followup_h: number; second_followup_h: number }[]
  won_by_grade: { grade: string; count: number; avg_speed: number | null }[]
}

async function fetchIntelligence(period: string): Promise<IntelData> {
  const res = await fetch(`/api/analytics/intelligence?period=${period}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOSS_META: Record<string, { icon: React.ReactNode; iconBg: string; iconColor: string; bar: string }> = {
  "Follow-up delay or skip": {
    icon:      <AlertTriangle className="w-4 h-4" />,
    iconBg:    "linear-gradient(180deg, #FECACA 0%, #FCA5A5 100%)",
    iconColor: "#DC2626",
    bar:       "bg-red-500",
  },
  "Never contacted": {
    icon:      <PhoneOff className="w-4 h-4" />,
    iconBg:    "linear-gradient(180deg, #FED7AA 0%, #FDBA74 100%)",
    iconColor: "#EA580C",
    bar:       "bg-orange-400",
  },
  "Engaged but went cold": {
    icon:      <Snowflake className="w-4 h-4" />,
    iconBg:    "linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%)",
    iconColor: "#D97706",
    bar:       "bg-amber-400",
  },
}
const DEFAULT_LOSS = {
  icon:      <AlertTriangle className="w-4 h-4" />,
  iconBg:    "linear-gradient(180deg, #E2E8F0 0%, #CBD5E1 100%)",
  iconColor: "#475569",
  bar:       "bg-slate-400",
}

const GRADE_PLAYBOOK: Record<string, { action: string; defaultH: number; channel: "CALL" | "WHATSAPP"; desc: string }> = {
  A: { action: "Call within 2h",     defaultH: 2,  channel: "CALL",     desc: "Hottest leads go cold fast" },
  B: { action: "WhatsApp within 4h", defaultH: 4,  channel: "WHATSAPP", desc: "High intent, needs nudge" },
  C: { action: "WA within 24h",      defaultH: 24, channel: "WHATSAPP", desc: "Warm — don't let them drift" },
  D: { action: "Follow-up 48h",      defaultH: 48, channel: "WHATSAPP", desc: "Low priority, stay on radar" },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

// ── Apply Fix hook (preserved) ───────────────────────────────────────────────

function useApplyFix() {
  const queryClient = useQueryClient()
  const [applying, setApplying] = useState<Record<string, boolean>>({})
  const [applied,  setApplied]  = useState<Record<string, boolean>>({})

  async function applyFix(grade: string, first_followup_h: number, channel: string) {
    const key = `${grade}-${first_followup_h}`
    setApplying((p) => ({ ...p, [key]: true }))
    try {
      const res = await fetch("/api/settings/follow-up-config", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          schedule: { first_followup_h, second_followup_h: first_followup_h * 3, max_followups: 5, action_type: channel },
        }),
      })
      if (res.ok) {
        setApplied((p) => ({ ...p, [key]: true }))
        queryClient.invalidateQueries({ queryKey: ["analytics-intelligence"] })
        toast.success(`Grade ${grade} follow-up updated to ${first_followup_h}h`)
      } else { toast.error("Failed to apply fix") }
    } finally {
      setApplying((p) => ({ ...p, [key]: false }))
    }
  }

  return { applyFix, applying, applied }
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, iconBg, iconColor, valueColor = "text-ink",
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode
  icon: React.ReactNode; iconBg: string; iconColor: string; valueColor?: string
}) {
  return (
    <div className="glass-3 gloss-edge rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 10px ${iconColor}22` }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <p className="text-[12px] font-semibold text-ink-soft leading-tight pt-1">{label}</p>
      </div>
      <div className={`mt-3 text-[26px] md:text-[28px] font-bold tabular-nums leading-none ${valueColor}`}>
        {value}
      </div>
      <div className="mt-2 text-[12px] text-ink-muted min-h-[16px]">{sub}</div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const isManager = useHasRole("ADMIN", "MANAGER")
  const { applyFix, applying, applied } = useApplyFix()
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d")

  const { data, isLoading } = useQuery<IntelData>({
    queryKey:        ["analytics-intelligence", period],
    queryFn:         () => fetchIntelligence(period),
    refetchInterval: 120_000,
    enabled:         isManager,
  })

  if (!isManager) return (
    <div className="py-20 text-center">
      <p className="text-[14px] font-medium text-ink-muted">Analytics is available to Admins and Managers only.</p>
    </div>
  )

  const loss        = data?.loss_reasons       ?? []
  const grades      = data?.grade_missed       ?? []
  const pred        = data?.prediction
  const pats        = data?.patterns
  const sources     = data?.source_performance ?? []
  const reps        = data?.rep_performance    ?? []
  const configs     = data?.follow_up_configs  ?? []
  const wonByGrade  = data?.won_by_grade       ?? []

  const days     = pred?.days ?? []
  const maxDay   = Math.max(...days.map((d) => d.missed_value), 1)
  const today7   = days[days.length - 1]?.missed_value ?? 0
  const today6   = days[days.length - 2]?.missed_value ?? 0
  const trendUp  = today7 > today6
  const trendDn  = today7 < today6 && today6 > 0
  const trendLabel = trendUp ? "Worsening" : trendDn ? "Improving" : "Flat"
  const trendColor = trendUp ? "text-red-600" : trendDn ? "text-emerald-600" : "text-ink-muted"

  const followUpGapValue = data?.follow_up_gap_value ?? 0
  const currentAvgSpeed  = pats?.avg_speed_missed ?? null
  const simRecovery      = Math.round(followUpGapValue * 0.35)
  const showSimulation   = followUpGapValue > 0 && currentAvgSpeed != null && currentAvgSpeed > 3

  const configMap   = Object.fromEntries(configs.map((c) => [c.grade, c.first_followup_h]))
  const sortedReps  = [...reps].sort((a, b) => b.missed_value - a.missed_value)
  const topMissedId = sortedReps[0]?.id
  const topWonId    = [...reps].sort((a, b) => b.won_value - a.won_value)[0]?.id
  const maxSrcLeads = Math.max(...sources.map((s) => s.total_leads), 1)

  // KPI: loss rate (missed vs missed+won universe)
  const wonCountTotal = wonByGrade.reduce((s, g) => s + g.count, 0)
  const lossUniverse  = (data?.total_missed_count ?? 0) + wonCountTotal
  const lossRatePct   = lossUniverse > 0
    ? Math.round(((data?.total_missed_count ?? 0) / lossUniverse) * 100)
    : null

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(14,165,233,0.25)",
            }}
          >
            <BarChart3 className="w-6 h-6 text-sky-700" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-[32px] md:text-[36px] font-bold text-ink tracking-[-0.025em] leading-[1.05]">Analytics</h1>
            <p className="text-[14px] text-ink-soft mt-2 leading-relaxed max-w-[560px]">
              Find what&apos;s slowing your pipeline. See loss patterns, recovery potential, and one-click fixes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/missed"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-sky-700 border border-sky-200 bg-white/70 hover:bg-sky-50 transition-colors"
          >
            Missed Opps <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          {/* Period toggle — glassy pill */}
          <div className="flex items-center gap-0.5 bg-white/80 border border-hairline-strong rounded-xl p-1">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  period === p
                    ? "bg-sky-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_6px_rgba(14,165,233,0.30)]"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5 KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="₹ Missed"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : formatValue(data?.total_missed_value ?? 0)}
          valueColor="text-red-600"
          sub={data ? `${data.total_missed_count} leads` : null}
          icon={<AlertTriangle className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #FECACA 0%, #FCA5A5 100%)"
          iconColor="#DC2626"
        />
        <KpiCard
          label="₹ Recoverable"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : formatValue(pred?.recovery_potential ?? 0)}
          valueColor="text-emerald-600"
          sub={pred && pred.recovery_potential > 0 ? <Link href="/follow-ups" className="hover:text-sky-600">overdue follow-ups →</Link> : "no overdue"}
          icon={<Target className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #BBF7D0 0%, #86EFAC 100%)"
          iconColor="#059669"
        />
        <KpiCard
          label="Speed-to-Win avg"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : pats?.avg_speed_won != null ? formatDuration(pats.avg_speed_won) : "—"}
          valueColor="text-sky-600"
          sub={pats?.avg_speed_won != null ? "for closed-won leads" : null}
          icon={<Clock className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)"
          iconColor="#0284C7"
        />
        <KpiCard
          label="Speed-to-Miss avg"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : pats?.avg_speed_missed != null ? formatDuration(pats.avg_speed_missed) : "—"}
          valueColor="text-orange-600"
          sub={pats?.avg_speed_missed != null ? "for missed leads" : null}
          icon={<Clock className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #FED7AA 0%, #FDBA74 100%)"
          iconColor="#EA580C"
        />
        <KpiCard
          label="7-Day Trend"
          value={isLoading ? <Skeleton className="h-8 w-24" /> : (
            <span className="flex items-center gap-1.5">
              {trendUp  && <TrendingUp   className="w-5 h-5 text-red-500" />}
              {trendDn  && <TrendingDown className="w-5 h-5 text-emerald-500" />}
              {!trendUp && !trendDn && <Minus className="w-5 h-5 text-ink-muted" />}
              <span className={`text-[22px] ${trendColor}`}>{trendLabel}</span>
            </span>
          )}
          sub={data && data.total_missed_value > 0 ? `${formatValue(data.total_missed_value)} all-time` : "no losses yet"}
          icon={<BarChart3 className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #DDD6FE 0%, #C4B5FD 100%)"
          iconColor="#7C3AED"
        />
      </div>

      {/* ── 7-day bar chart ─────────────────────────────────────────────────── */}
      {(!isLoading && days.some((d) => d.missed_value > 0)) && (
        <div className="glass-2 gloss-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[15px] font-semibold text-ink">Daily Miss Trend</h2>
            <p className="text-[11px] font-mono uppercase tracking-[0.10em] text-ink-muted">₹ missed per day</p>
          </div>
          <div className="flex items-end gap-2 h-24">
            {days.map((d) => {
              const pct     = Math.round((d.missed_value / maxDay) * 100)
              const isToday = d.date === new Date().toISOString().slice(0, 10)
              const dow     = new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5"
                  title={`${d.date}: ${formatValue(d.missed_value)}`}>
                  <div className="w-full flex items-end h-16">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        isToday ? "bg-red-500" : d.missed_value > 0 ? "bg-red-200" : "bg-slate-100"
                      }`}
                      style={{
                        height:    `${Math.max(pct, d.missed_value > 0 ? 10 : 4)}%`,
                        boxShadow: d.missed_value > 0 ? "inset 0 1px 0 rgba(255,255,255,0.4)" : "none",
                      }}
                    />
                  </div>
                  <span className={`text-[10.5px] font-medium tabular-nums ${isToday ? "text-ink font-bold" : "text-ink-muted"}`}>{dow}</span>
                  {d.missed_value > 0 && (
                    <span className="text-[9.5px] text-ink-muted tabular-nums">{formatValue(d.missed_value)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2-col: Loss reasons | Speed comparison + Recovery ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Loss reasons (3/5) */}
        <div className="lg:col-span-3 glass-2 gloss-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[15px] font-semibold text-ink">Why You&apos;re Losing</h2>
            {!isLoading && (data?.total_missed_count ?? 0) > 0 && (
              <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ink-muted">
                {data!.total_missed_count} leads · {formatValue(data!.total_missed_value)}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          ) : loss.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-emerald-600 justify-center">
              <CheckCircle2 className="w-5 h-5" />
              <p className="text-[13px] font-semibold">No missed leads yet — keep it up.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {loss.map((r) => {
                const meta = LOSS_META[r.reason] ?? DEFAULT_LOSS

                const fixInfo = (() => {
                  if (r.reason === "Follow-up delay or skip") {
                    const currentA = configMap["A"] ?? null
                    const currentB = configMap["B"] ?? null
                    const needsFix = (currentA != null && currentA > 3) || (currentB != null && currentB > 5) || currentA == null
                    return {
                      fix:       "Tighten follow-up: call A-grade within 2h, B-grade within 4h",
                      recovery:  Math.round(r.value * 0.35),
                      action:    needsFix ? "apply-timing" : null,
                      isApplied: applied["A-2"] && applied["B-4"],
                    }
                  }
                  if (r.reason === "Never contacted") return {
                    fix:       "First contact must happen within 1h — open queue and work it",
                    recovery:  Math.round(r.value * 0.5),
                    action:    "go-queue",
                    isApplied: false,
                  }
                  if (r.reason === "Engaged but went cold") return {
                    fix:       "Add a re-engagement follow-up within 24h of every signal",
                    recovery:  Math.round(r.value * 0.2),
                    action:    "go-followups",
                    isApplied: false,
                  }
                  return null
                })()

                return (
                  <div key={r.reason} className="rounded-xl border border-hairline overflow-hidden bg-white/50">
                    {/* Reason header */}
                    <div className="px-4 pt-4 pb-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: meta.iconBg, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)" }}
                          >
                            <span style={{ color: meta.iconColor }}>{meta.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-ink leading-tight truncate">{r.reason}</p>
                            <p className="text-[11px] text-ink-muted mt-0.5">{r.count} lead{r.count !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[20px] font-bold text-red-600 tabular-nums leading-none">{formatValue(r.value)}</p>
                          <p className="text-[11px] text-ink-muted tabular-nums mt-1">{r.pct}% of losses</p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-slate-100/60 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${meta.bar}`} style={{ width: `${r.pct}%` }} />
                      </div>
                    </div>

                    {/* Fix recommendation */}
                    {fixInfo && (
                      <div className="border-t border-hairline bg-sky-50/40 px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Zap className="w-3 h-3 text-sky-500 shrink-0" />
                            <span className="text-[10.5px] font-bold text-sky-600 uppercase tracking-[0.08em]">Fix</span>
                          </div>
                          <p className="text-[12.5px] text-ink leading-snug">{fixInfo.fix}</p>
                          {fixInfo.recovery > 0 && (
                            <p className="text-[12px] font-bold text-emerald-600 mt-1">→ Est. recovery: {formatValue(fixInfo.recovery)}</p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {fixInfo.isApplied ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                            </span>
                          ) : fixInfo.action === "apply-timing" ? (
                            <button
                              onClick={() => Promise.all([applyFix("A", 2, "CALL"), applyFix("B", 4, "WHATSAPP")])}
                              disabled={applying["A-2"] || applying["B-4"]}
                              className="text-[12px] font-semibold text-white rounded-lg px-3 py-1.5 disabled:opacity-50 transition-all whitespace-nowrap"
                              style={{
                                background: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)",
                                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 6px rgba(14,165,233,0.25)",
                              }}
                            >
                              {applying["A-2"] ? "Applying…" : "Apply Fix →"}
                            </button>
                          ) : fixInfo.action === "go-queue" ? (
                            <Link href="/queue" className="text-[12px] font-semibold text-sky-700 border border-sky-200 rounded-lg px-3 py-1.5 hover:bg-sky-50 transition-colors whitespace-nowrap">
                              Open Queue →
                            </Link>
                          ) : fixInfo.action === "go-followups" ? (
                            <Link href="/follow-ups" className="text-[12px] font-semibold text-sky-700 border border-sky-200 rounded-lg px-3 py-1.5 hover:bg-sky-50 transition-colors whitespace-nowrap">
                              Follow-ups →
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Grade breakdown of missed */}
          {!isLoading && grades.length > 0 && (
            <div className="pt-4 mt-4 border-t border-hairline">
              <p className="text-[11px] font-mono uppercase tracking-[0.10em] text-ink-muted mb-3">Missed by grade</p>
              <div className="flex gap-2 flex-wrap">
                {grades.map(({ grade, count, value }) => (
                  <div key={grade} className="flex items-center gap-2 rounded-xl bg-white/70 border border-hairline px-3 py-2">
                    <GradeBadge grade={grade} size="sm" />
                    <div>
                      <span className="text-[13px] font-bold text-ink tabular-nums">{count}</span>
                      {value > 0 && <p className="text-[10px] text-ink-muted tabular-nums leading-none mt-0.5">{formatValue(value)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Speed + Recovery (2/5) — stacked */}
        <div className="lg:col-span-2 space-y-4">

          {/* Speed comparison */}
          <div className="glass-2 gloss-edge rounded-2xl p-6">
            <h2 className="text-[15px] font-semibold text-ink mb-4">Speed to First Contact</h2>
            {isLoading ? <Skeleton className="h-28 rounded-xl" /> : (
              (pats?.avg_speed_won != null || pats?.avg_speed_missed != null) ? (
                <div className="space-y-4">
                  {pats?.avg_speed_won != null && (
                    <SpeedRow label="Won leads" value={formatDuration(pats.avg_speed_won)} pct={100} color="bg-emerald-500" textColor="text-emerald-700" />
                  )}
                  {pats?.avg_speed_missed != null && (() => {
                    const ratio = pats.avg_speed_won != null
                      ? Math.min(100, Math.round((pats.avg_speed_won / pats.avg_speed_missed) * 100))
                      : 60
                    return <SpeedRow label="Missed leads" value={formatDuration(pats.avg_speed_missed)} pct={ratio} color="bg-red-400" textColor="text-red-600" />
                  })()}
                  {pats?.speed_insight && (
                    <p className="text-[12px] text-sky-700 bg-sky-50/70 rounded-xl px-3 py-2 border border-sky-100 font-medium">{pats.speed_insight}</p>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-ink-muted py-4">Patterns appear as you close and miss deals.</p>
              )
            )}
          </div>

          {/* Recovery simulation */}
          <div className="glass-2 gloss-edge rounded-2xl p-6">
            <h2 className="text-[15px] font-semibold text-ink mb-4">Recovery Simulation</h2>
            {isLoading ? <Skeleton className="h-28 rounded-xl" /> : (
              showSimulation ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-xl bg-red-50/70 border border-red-100 px-3 py-2.5 text-center">
                      <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-ink-muted">Current</p>
                      <p className="text-[18px] font-bold text-red-600 tabular-nums">{formatDuration(currentAvgSpeed!)}</p>
                    </div>
                    <span className="text-ink-faint text-lg">→</span>
                    <div className="flex-1 rounded-xl bg-emerald-50/70 border border-emerald-100 px-3 py-2.5 text-center">
                      <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-ink-muted">Target</p>
                      <p className="text-[18px] font-bold text-emerald-700">2h</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 px-4 py-3">
                    <p className="text-[10.5px] font-mono uppercase tracking-[0.08em] text-emerald-700 mb-0.5">Estimated Recovery</p>
                    <p className="text-[24px] font-bold text-emerald-700 tabular-nums">{formatValue(simRecovery)}</p>
                    <p className="text-[11px] text-emerald-700/80 mt-0.5">35% of {formatValue(followUpGapValue)} lost to follow-up gaps</p>
                    <Link href="/missed" className="inline-block mt-2 text-[11px] font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900">
                      View recoverable leads →
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-ink-muted py-4">Simulation appears when avg response time exceeds 3h.</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Lead Playbook (full-width) ──────────────────────────────────────── */}
      <div className="glass-2 gloss-edge rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-ink">Lead Playbook</h2>
          <span className="text-[11px] font-mono uppercase tracking-[0.10em] text-ink-muted">Best practice per grade</span>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {(["A","B","C","D"] as const).map((grade) => {
              const pb        = GRADE_PLAYBOOK[grade]
              const won       = wonByGrade.find((g) => g.grade === grade)
              const curConf   = configMap[grade]
              const isFast    = curConf != null && curConf <= pb.defaultH
              const key       = `${grade}-${pb.defaultH}`
              const isApplied = applied[key] || isFast

              return (
                <div key={grade} className="rounded-xl border border-hairline bg-white/60 px-4 py-3.5 flex items-start gap-3">
                  <GradeBadge grade={grade} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink leading-tight">{pb.action}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{pb.desc}</p>
                    <p className="text-[11px] text-ink-soft mt-1.5">
                      {won?.avg_speed != null
                        ? `Won avg: ${formatDuration(won.avg_speed)} · ${won.count} won`
                        : curConf != null
                          ? `Config: ${curConf}h first follow-up`
                          : "No config set"}
                    </p>
                    <div className="mt-2">
                      {isApplied ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <button
                          onClick={() => applyFix(grade, pb.defaultH, pb.channel)}
                          disabled={applying[key]}
                          className="text-[11px] font-semibold text-sky-700 border border-sky-200 rounded-lg px-2.5 py-1 hover:bg-sky-50 disabled:opacity-50 transition-colors"
                        >
                          {applying[key] ? "…" : "Apply →"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 2-col bottom: Source Quality | Rep Performance ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Source Quality */}
        {(isLoading || sources.length > 0) && (
          <div className="glass-2 gloss-edge rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Source Quality</h2>
              <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ink-muted">{sources.length} sources</span>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
            ) : (
              <div>
                <div className="grid grid-cols-12 px-6 py-2.5 text-[10px] font-mono font-semibold text-ink-muted uppercase tracking-[0.08em] bg-sky-50/40">
                  <span className="col-span-4">Source</span>
                  <span className="col-span-3 text-right">Leads</span>
                  <span className="col-span-2.5 text-right">Win%</span>
                  <span className="col-span-2.5 text-right">Miss%</span>
                </div>
                {sources.map((src) => (
                  <div key={src.id} className="grid grid-cols-12 px-6 py-3 items-center hover:bg-sky-50/30 transition-colors border-t border-hairline first:border-0">
                    <div className="col-span-4 min-w-0 pr-2">
                      <p className="text-[13px] font-semibold text-ink truncate">{src.name}</p>
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-sky-300 rounded-full" style={{ width: `${(src.total_leads / maxSrcLeads) * 100}%` }} />
                        </div>
                        <span className="text-[12px] tabular-nums text-ink font-medium">{src.total_leads}</span>
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${src.conversion_rate}%` }} />
                        </div>
                        <span className={`text-[12px] tabular-nums font-bold ${src.conversion_rate >= 20 ? "text-emerald-600" : src.conversion_rate >= 5 ? "text-ink" : "text-ink-muted"}`}>
                          {src.conversion_rate}%
                        </span>
                      </div>
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-red-300 rounded-full" style={{ width: `${src.miss_rate}%` }} />
                        </div>
                        <span className={`text-[12px] tabular-nums font-bold ${src.miss_rate >= 30 ? "text-red-600" : src.miss_rate >= 10 ? "text-orange-600" : "text-ink-muted"}`}>
                          {src.miss_rate}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rep Performance */}
        {(isLoading || reps.length > 0) && (
          <div className="glass-2 gloss-edge rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Rep Performance</h2>
              <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ink-muted">{reps.length} reps</span>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : (
              <div>
                <div className="grid grid-cols-[1fr_60px_70px_70px_60px] px-6 py-2.5 text-[10px] font-mono font-semibold text-ink-muted uppercase tracking-[0.08em] bg-sky-50/40">
                  <span>Rep</span>
                  <span className="text-right">A-rate</span>
                  <span className="text-right">Won</span>
                  <span className="text-right">Missed</span>
                  <span className="text-right">Conv%</span>
                </div>
                {sortedReps.map((rep, idx) => {
                  const isTopWon = rep.id === topWonId    && rep.won_value   > 0
                  const isWorst  = rep.id === topMissedId && rep.missed_value > 0 && reps.length > 1
                  const aContactRate = rep.a_grade_total > 0
                    ? Math.round((rep.a_grade_contacted / rep.a_grade_total) * 100)
                    : null

                  const coaching = (() => {
                    if (isWorst && rep.speed_to_lead != null && rep.speed_to_lead > 4)
                      return `Slow response (${formatDuration(rep.speed_to_lead)} avg) — needs faster first contact`
                    if (isWorst && rep.missed_count > 3)
                      return `${rep.missed_count} missed leads — review follow-up discipline`
                    if (isTopWon && rep.won_value > 0)
                      return `Top performer — consider assigning more A-grade leads`
                    if (aContactRate !== null && aContactRate < 50 && rep.a_grade_total >= 3)
                      return `Only ${aContactRate}% of Grade A leads contacted in window — speed needs work`
                    return null
                  })()

                  return (
                    <div key={rep.id} className={`${idx !== 0 ? "border-t border-hairline" : ""} ${isWorst ? "bg-red-50/30" : ""}`}>
                      <div className="grid grid-cols-[1fr_60px_70px_70px_60px] px-6 py-3 items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            isTopWon ? "bg-emerald-100 text-emerald-700" : isWorst ? "bg-red-100 text-red-600" : "bg-slate-100 text-ink-soft"
                          }`}>
                            {rep.first_name[0]}{rep.last_name?.[0] ?? ""}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-ink truncate leading-tight">
                              {rep.first_name} {rep.last_name ?? ""}
                            </p>
                            {isTopWon && <span className="text-[9px] font-bold text-emerald-600 block">Top</span>}
                            {isWorst  && <span className="text-[9px] font-bold text-red-500 block">Watch</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          {aContactRate !== null ? (
                            <span className={`text-[12px] font-bold tabular-nums ${aContactRate >= 80 ? "text-emerald-600" : aContactRate >= 50 ? "text-orange-600" : "text-red-500"}`}>
                              {rep.a_grade_contacted}/{rep.a_grade_total}
                            </span>
                          ) : <span className="text-[12px] text-ink-faint">—</span>}
                        </div>
                        <span className={`text-[12px] tabular-nums font-bold text-right ${rep.won_value > 0 ? "text-emerald-600" : "text-ink-faint"}`}>
                          {rep.won_value > 0 ? formatValue(rep.won_value) : "—"}
                        </span>
                        <span className={`text-[12px] tabular-nums font-bold text-right ${rep.missed_value > 0 ? "text-red-500" : "text-ink-faint"}`}>
                          {rep.missed_value > 0 ? formatValue(rep.missed_value) : "—"}
                        </span>
                        <span className={`text-[12px] tabular-nums font-bold text-right ${
                          rep.conversion_rate !== null
                            ? rep.conversion_rate >= 50 ? "text-emerald-600"
                            : rep.conversion_rate >= 25 ? "text-orange-600"
                            : "text-red-500"
                            : "text-ink-faint"
                        }`}>
                          {rep.conversion_rate !== null ? `${rep.conversion_rate}%` : "—"}
                        </span>
                      </div>
                      {coaching && (
                        <div className="px-6 pb-3 -mt-1">
                          <p className="text-[11px] text-ink-soft bg-white/70 border border-hairline rounded-lg px-3 py-1.5">
                            {coaching}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loss Rate KPI tucked at bottom for completeness */}
      {lossRatePct !== null && (
        <div className="rounded-2xl bg-white/70 border border-hairline px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(180deg, #FED7AA 0%, #FDBA74 100%)" }}
            >
              <IndianRupee className="w-4 h-4 text-orange-600" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink">Account loss rate</p>
              <p className="text-[12px] text-ink-muted mt-0.5">{data?.total_missed_count ?? 0} missed of {lossUniverse} (won + missed)</p>
            </div>
          </div>
          <span className={`text-[18px] font-bold tabular-nums ${lossRatePct >= 30 ? "text-red-600" : lossRatePct >= 15 ? "text-orange-600" : "text-emerald-600"}`}>
            {lossRatePct}%
          </span>
        </div>
      )}
    </div>
  )
}

function SpeedRow({ label, value, pct, color, textColor }: {
  label: string; value: string; pct: number; color: string; textColor: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-ink-soft">{label}</span>
        <span className={`text-[15px] font-bold tabular-nums ${textColor}`}>{value}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
