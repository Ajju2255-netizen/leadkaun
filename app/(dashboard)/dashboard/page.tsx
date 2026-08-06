"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowUpRight, Plus, Calendar,
  Users, Send, CheckCircle2, Trophy, IndianRupee,
  Phone, MessageSquare, Mail, Upload, Cog, Sparkles,
  Activity, AlertTriangle, Snowflake,
  LayoutDashboard,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { DeltaChip } from "@/components/shared/DeltaChip"
import { timeAgo } from "@/lib/format"

// ── Types ─────────────────────────────────────────────────────────────────

type KpiBucket    = { value: number; pct_change: number | null }
type FunnelStage  = { name: string; key: string; count: number; pct: number }
type RepRow       = { id: string; first_name: string; last_name: string | null; revenue: number; wins: number }
type SourceRow    = { id: string; name: string; total_leads: number; recent_7d: number; status: "active" | "slowing" | "cold" }
type ActivityItem = {
  id: string
  category: "call" | "whatsapp" | "import" | "system" | "email"
  title: string
  lead_id: string
  lead_name: string
  company: string | null
  rep_name: string | null
  created_at: string
}
type BehaviourBand = { count: number; pct: number }

interface PulseData {
  kpis: {
    new_leads:       KpiBucket
    first_contacts:  KpiBucket
    followups_done:  KpiBucket
    wins:            KpiBucket
    revenue:         KpiBucket
  }
  funnel: {
    stages:         FunnelStage[]
    total_entered:  number
    conversion_pct: number
    goal_pct:       number
  }
  top_reps: RepRow[]
  sources:  SourceRow[]
  recent_activity: ActivityItem[]
  behaviour_health: {
    total:        number
    healthy:      BehaviourBand
    at_risk:      BehaviourBand
    missed:       BehaviourBand
    cold:         BehaviourBand
    headline_pct: number
  }
}

async function fetchPulse(): Promise<PulseData> {
  const r = await fetch("/api/analytics/dashboard-pulse", { credentials: "include" })
  if (!r.ok) throw new Error("Failed")
  return r.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}Cr`
  if (n >= 1_00_000)    return `${(n / 1_00_000).toFixed(1)}L`
  if (n >= 1_000)       return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString("en-IN")
}


const ACTIVITY_STYLE: Record<ActivityItem["category"], { icon: typeof Phone; tintBg: string; tintFg: string }> = {
  call:     { icon: Phone,         tintBg: "bg-sky-50",     tintFg: "text-sky-600"     },
  whatsapp: { icon: MessageSquare, tintBg: "bg-emerald-50", tintFg: "text-emerald-600" },
  email:    { icon: Mail,          tintBg: "bg-violet-50",  tintFg: "text-violet-600"  },
  import:   { icon: Upload,        tintBg: "bg-orange-50",  tintFg: "text-orange-600"  },
  system:   { icon: Cog,           tintBg: "bg-slate-100",  tintFg: "text-slate-500"   },
}

// Vibrant funnel band colors (top → bottom of funnel)
const FUNNEL_COLORS = [
  { bar: "bg-sky-500",     swatch: "bg-sky-500"     },
  { bar: "bg-cyan-500",    swatch: "bg-cyan-500"    },
  { bar: "bg-violet-500",  swatch: "bg-violet-500"  },
  { bar: "bg-orange-400",  swatch: "bg-orange-400"  },
  { bar: "bg-amber-400",   swatch: "bg-amber-400"   },
  { bar: "bg-rose-400",    swatch: "bg-rose-400"    },
  { bar: "bg-emerald-500", swatch: "bg-emerald-500" },
]

// ── Components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, pctChange, icon, tintBg, tintFg, invertDelta = false,
}: {
  label: string
  value: React.ReactNode
  pctChange: number | null
  icon: React.ReactNode
  tintBg: string
  tintFg: string
  invertDelta?: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${tintBg} ${tintFg}`}>
          {icon}
        </span>
        <p className="text-[12px] font-medium text-ink-soft truncate">{label}</p>
      </div>
      <div className="mt-3 text-[26px] font-bold tabular-nums leading-none text-ink">
        {value}
      </div>
      <div className="mt-2 flex items-center gap-1.5 min-h-[16px]">
        {pctChange == null ? (
          <span className="text-[11.5px] text-ink-muted">— vs last month</span>
        ) : (
          <>
            <DeltaChip delta={pctChange} invert={invertDelta} />
            <span className="text-[11.5px] text-ink-muted">vs last month</span>
          </>
        )}
      </div>
    </div>
  )
}

function HealthDonut({ pct, total }: { pct: number; total: number }) {
  // 36px radius circumference = 226.19; we reveal `pct` of it
  const C = 2 * Math.PI * 36
  // With no active leads there's nothing to score — show a neutral empty ring
  // instead of "0% / At risk", which falsely reads as a problem.
  const empty = total <= 0
  const offset = empty ? C : C - (pct / 100) * C
  const ringColor =
    pct >= 80 ? "text-emerald-500" :
    pct >= 60 ? "text-sky-500" :
    pct >= 40 ? "text-orange-400" :
                "text-red-500"
  const headline =
    pct >= 80 ? "Excellent" :
    pct >= 60 ? "Healthy" :
    pct >= 40 ? "Mixed" :
                "At risk"

  return (
    <div className="relative w-[120px] h-[120px] mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="36" fill="none" stroke="#E2E8F0" strokeWidth="9" />
        {!empty && (
          <circle
            cx="50" cy="50" r="36" fill="none" strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={ringColor}
            stroke="currentColor"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {empty ? (
          <>
            <div className="text-[24px] font-bold text-ink-faint tabular-nums leading-none">—</div>
            <div className="text-[11px] text-ink-muted mt-1">No active leads</div>
          </>
        ) : (
          <>
            <div className="text-[24px] font-bold text-ink tabular-nums leading-none">{pct}%</div>
            <div className="text-[11px] text-ink-muted mt-1">healthy</div>
            <div className={`text-[10px] font-semibold mt-0.5 ${ringColor}`}>{headline}</div>
          </>
        )}
      </div>
    </div>
  )
}

const SOURCE_STATUS_STYLE: Record<SourceRow["status"], { label: string; pillCls: string; dotCls: string }> = {
  active:  { label: "Active",   pillCls: "bg-emerald-50 text-emerald-700 border-emerald-200", dotCls: "bg-emerald-500" },
  slowing: { label: "Slowing",  pillCls: "bg-amber-50 text-amber-700 border-amber-200",       dotCls: "bg-amber-500"   },
  cold:    { label: "Cold",     pillCls: "bg-red-50 text-red-600 border-red-200",             dotCls: "bg-red-500"     },
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-pulse"],
    queryFn:  fetchPulse,
    refetchInterval: 60_000,
    staleTime:       55_000,
  })

  const k         = data?.kpis
  const funnel    = data?.funnel
  const topReps   = data?.top_reps     ?? []
  const sources   = data?.sources      ?? []
  const activity  = data?.recent_activity ?? []
  const health    = data?.behaviour_health
  const topRepRev = topReps[0]?.revenue ?? 0

  return (
    <div className="space-y-6">

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl grid place-items-center bg-sky-50 text-sky-600 shrink-0">
            <LayoutDashboard className="w-5 h-5" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-[24px] font-semibold text-ink tracking-[-0.02em] leading-tight">
              Sales Behaviour Pulse
            </h1>
            <p className="text-[13px] text-ink-muted mt-1 leading-relaxed max-w-[560px]">
              Today&apos;s revenue radar — what your team did, what&apos;s slipping, and where the next ₹ is hiding.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Static period indicator — the pulse is this-month scoped. */}
          <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold text-ink-soft bg-white border border-slate-200">
            <Calendar className="w-4 h-4 text-ink-muted" strokeWidth={2} />
            This month
          </span>
          <Link
            href="/leads/import"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Import leads
          </Link>
        </div>
      </div>

      {/* ── 5 KPI cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="New Leads"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.new_leads.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.new_leads.pct_change ?? null}
          icon={<Users className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-sky-50" tintFg="text-sky-600"
        />
        <KpiCard
          label="First Contacts Made"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.first_contacts.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.first_contacts.pct_change ?? null}
          icon={<Send className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-orange-50" tintFg="text-orange-600"
        />
        <KpiCard
          label="Follow-ups Completed"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.followups_done.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.followups_done.pct_change ?? null}
          icon={<CheckCircle2 className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-violet-50" tintFg="text-violet-600"
        />
        <KpiCard
          label="Leads Won"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.wins.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.wins.pct_change ?? null}
          icon={<Trophy className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-emerald-50" tintFg="text-emerald-600"
        />
        <KpiCard
          label="Revenue"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : `₹${formatINR(k?.revenue.value ?? 0)}`}
          pctChange={k?.revenue.pct_change ?? null}
          icon={<IndianRupee className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-teal-50" tintFg="text-teal-600"
        />
      </div>

      {/* ── 2-col: Funnel + Top Reps ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Funnel — wider (3/5) */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200/70 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[15px] font-semibold text-ink">Pipeline Funnel</h2>
              <span className="text-[10px] text-ink-muted font-medium uppercase tracking-[0.10em]">all-time</span>
            </div>
            <span className="text-[11px] text-ink-muted font-mono uppercase tracking-[0.10em]">
              {funnel?.total_entered ?? 0} leads entered
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
            </div>
          ) : (
            <>
              {funnel && funnel.total_entered > 0 ? (
                <>
                  {/* One segmented bar — how the pipeline's leads are split across
                      stages. Segment widths are each stage's share of the total. */}
                  <div className="flex h-9 w-full gap-0.5 rounded-lg overflow-hidden">
                    {funnel.stages.map((s, i) => {
                      if (s.count <= 0) return null
                      const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
                      const w = (s.count / funnel.total_entered) * 100
                      return (
                        <div
                          key={s.key}
                          className={`${color.bar} h-full transition-all duration-500`}
                          style={{ width: `${w}%`, minWidth: 3 }}
                          title={`${s.name}: ${s.count.toLocaleString("en-IN")} (${s.pct}%)`}
                        />
                      )
                    })}
                  </div>

                  {/* Legend */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {funnel.stages.map((s, i) => {
                      const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
                      return (
                        <div key={s.key} className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${color.swatch}`} />
                          <span className="text-[12.5px] text-ink-soft truncate flex-1">{s.name}</span>
                          <span className="text-[13px] font-semibold text-ink tabular-nums shrink-0">
                            {s.count.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[11.5px] text-ink-muted tabular-nums shrink-0 w-9 text-right">{s.pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-[13px] text-ink-muted">No leads in the pipeline yet.</div>
              )}

              {/* Conversion callout */}
              <div className="mt-5 flex items-start gap-3 rounded-xl px-4 py-3 bg-sky-50 border border-sky-100">
                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-sky-500" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">
                    <span className="font-semibold">Your conversion rate is {funnel?.conversion_pct ?? 0}%.</span>{" "}
                    {funnel && funnel.conversion_pct >= funnel.goal_pct
                      ? <span className="text-emerald-600 font-medium">Above your {funnel.goal_pct}% goal.</span>
                      : <span className="text-ink-muted">Goal: {funnel?.goal_pct ?? 15}%.</span>}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top performing reps — narrower (2/5) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-ink">Top Performing Reps</h2>
            <Link href="/rep-tracking" className="text-[12px] text-sky-600 font-semibold hover:text-sky-700">
              View all →
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : topReps.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-ink-muted">
              No wins yet this month.
            </div>
          ) : (
            <ul className="space-y-3.5">
              {topReps.map((rep, i) => {
                const widthPct = topRepRev > 0 ? Math.round((rep.revenue / topRepRev) * 100) : 0
                const barCls   =
                  i === 0 ? "bg-emerald-500" :
                  i === 1 ? "bg-sky-500" :
                  i === 2 ? "bg-violet-500" :
                            "bg-orange-400"
                return (
                  <li key={rep.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-medium text-ink truncate">
                          {rep.first_name} {rep.last_name ?? ""}
                        </span>
                        <span className="text-[12px] text-ink-muted tabular-nums shrink-0 ml-2">
                          {rep.wins} {rep.wins === 1 ? "win" : "wins"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barCls} rounded-full transition-all`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums text-ink shrink-0">
                      ₹{formatINR(rep.revenue)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── 3-col: Sources + Activity + Health ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Hot Sources */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
          <h2 className="text-[15px] font-semibold text-ink mb-4">Active Sources</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4].map((i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-ink-muted">
              No source data yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {sources.map((s) => {
                const sty = SOURCE_STATUS_STYLE[s.status]
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[13px] font-medium text-ink truncate">{s.name}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border rounded-full ${sty.pillCls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sty.dotCls}`} />
                        {sty.label}
                      </span>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums text-ink shrink-0">
                      {s.total_leads.toLocaleString("en-IN")}
                      <span className="text-ink-muted font-normal ml-0.5">leads</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <Link href="/leads" className="mt-5 pt-3 block text-center text-[12px] text-sky-600 font-semibold hover:text-sky-700 border-t border-slate-100">
            View all leads →
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
          <h2 className="text-[15px] font-semibold text-ink mb-4">Recent Activity</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : activity.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-ink-muted">
              No activity in the last 24 hours.
            </div>
          ) : (
            <ul className="space-y-3">
              {activity.slice(0, 5).map((a) => {
                const sty = ACTIVITY_STYLE[a.category]
                const Icon = sty.icon
                return (
                  <li key={a.id} className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 mt-0.5 ${sty.tintBg} ${sty.tintFg}`}>
                      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink leading-tight">{a.title}</p>
                      <p className="text-[11px] text-ink-muted truncate mt-0.5">
                        {a.lead_name}{a.company ? ` · ${a.company}` : ""}
                      </p>
                    </div>
                    <span className="text-[11px] text-ink-muted tabular-nums shrink-0 mt-0.5">
                      {timeAgo(a.created_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Behaviour Health */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
          <h2 className="text-[15px] font-semibold text-ink mb-4">Behaviour Health</h2>
          {isLoading ? (
            <Skeleton className="h-[120px] w-[120px] rounded-full mx-auto" />
          ) : health ? (
            <>
              <HealthDonut pct={health.headline_pct} total={health.total} />
              <ul className="mt-4 space-y-2">
                <BandRow label="Healthy"  count={health.healthy.count}  pct={health.healthy.pct}  icon={<Activity      className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.5} />} />
                <BandRow label="At risk"  count={health.at_risk.count}  pct={health.at_risk.pct}  icon={<AlertTriangle className="w-3.5 h-3.5 text-orange-500"  strokeWidth={2.5} />} />
                <BandRow label="Missed"   count={health.missed.count}   pct={health.missed.pct}   icon={<ArrowUpRight  className="w-3.5 h-3.5 text-red-500"     strokeWidth={2.5} />} />
                <BandRow label="Cold"     count={health.cold.count}     pct={health.cold.pct}     icon={<Snowflake     className="w-3.5 h-3.5 text-slate-500"   strokeWidth={2.5} />} />
              </ul>
              {health.total <= 0 ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 bg-sky-50/70 border border-sky-100">
                  <Activity className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <p className="text-[12px] text-ink leading-snug">
                    <span className="font-semibold text-sky-700">No active leads yet.</span>{" "}
                    Add <Link href="/leads" className="text-sky-600 font-semibold underline">leads</Link> to start tracking behaviour health.
                  </p>
                </div>
              ) : health.headline_pct >= 60 ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 bg-emerald-50/70 border border-emerald-100">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <p className="text-[12px] text-ink leading-snug">
                    <span className="font-semibold text-emerald-700">Pipeline is healthy.</span> Keep nudging follow-ups.
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 bg-orange-50/70 border border-orange-100">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <p className="text-[12px] text-ink leading-snug">
                    <span className="font-semibold text-orange-700">{health.at_risk.count + health.missed.count} leads need attention.</span>{" "}
                    Open <Link href="/missed" className="text-sky-600 font-semibold underline">Missed Opps</Link>.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function BandRow({ label, count, pct, icon }: {
  label: string; count: number; pct: number; icon: React.ReactNode
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center shrink-0">{icon}</span>
        <span className="text-[12px] text-ink-soft truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0 tabular-nums">
        <span className="text-[12px] font-semibold text-ink">{count}</span>
        <span className="text-[11px] text-ink-muted">({pct}%)</span>
      </div>
    </li>
  )
}
