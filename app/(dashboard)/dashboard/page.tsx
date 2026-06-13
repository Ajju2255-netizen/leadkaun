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

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60)         return "just now"
  if (d < 3600)       return `${Math.floor(d / 60)} min ago`
  if (d < 86400)      return `${Math.floor(d / 3600)} hr ago`
  if (d < 7 * 86400)  return `${Math.floor(d / 86400)} d ago`
  return `${Math.floor(d / (7 * 86400))} wk ago`
}

const ACTIVITY_STYLE: Record<ActivityItem["category"], { icon: typeof Phone; bg: string; color: string }> = {
  call:     { icon: Phone,        bg: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)", color: "#0284C7" },
  whatsapp: { icon: MessageSquare,bg: "linear-gradient(180deg, #A7F3D0 0%, #6EE7B7 100%)", color: "#059669" },
  email:    { icon: Mail,         bg: "linear-gradient(180deg, #DDD6FE 0%, #C4B5FD 100%)", color: "#7C3AED" },
  import:   { icon: Upload,       bg: "linear-gradient(180deg, #FED7AA 0%, #FDBA74 100%)", color: "#EA580C" },
  system:   { icon: Cog,          bg: "linear-gradient(180deg, #E2E8F0 0%, #CBD5E1 100%)", color: "#475569" },
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
  label, value, pctChange, icon, iconBg, iconColor, invertDelta = false,
}: {
  label: string
  value: React.ReactNode
  pctChange: number | null
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  invertDelta?: boolean
}) {
  return (
    <div className="glass-2 gloss-edge rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: iconBg,
            boxShadow:  `inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 10px ${iconColor}22`,
          }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <p className="text-[12px] font-semibold text-ink-soft leading-tight pt-1">{label}</p>
      </div>
      <div className="mt-3 text-[28px] md:text-[30px] font-bold tabular-nums leading-none text-ink">
        {value}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {pctChange == null ? (
          <span className="text-[12px] text-ink-muted">— vs last month</span>
        ) : (
          <>
            <DeltaChip delta={pctChange} invert={invertDelta} />
            <span className="text-[12px] text-ink-muted">vs last month</span>
          </>
        )}
      </div>
    </div>
  )
}

function HealthDonut({ pct, total }: { pct: number; total: number }) {
  // 36px radius circumference = 226.19; we reveal `pct` of it
  const C = 2 * Math.PI * 36
  const offset = C - (pct / 100) * C
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
        <circle
          cx="50" cy="50" r="36" fill="none" strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          className={ringColor}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[24px] font-bold text-ink tabular-nums leading-none">{pct}%</div>
        <div className="text-[11px] text-ink-muted mt-1">{headline}</div>
        {total > 0 && (
          <div className="text-[10px] text-ink-faint mt-0.5">{total} active</div>
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(14,165,233,0.25)",
            }}
          >
            <LayoutDashboard className="w-6 h-6 text-sky-700" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[32px] md:text-[36px] font-bold text-ink tracking-[-0.025em] leading-[1.05]">
              Sales Behaviour Pulse
            </h1>
            <p className="text-[14px] text-ink-soft mt-2 leading-relaxed max-w-[560px]">
              Today&apos;s revenue radar — what your team did, what&apos;s slipping, and where the next ₹ is hiding.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/leads/import"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-sky-700 border border-sky-200 bg-white/70 hover:bg-sky-50/80 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Import leads
          </Link>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-ink-soft border border-hairline-strong bg-white/70 cursor-default"
          >
            <Calendar className="w-4 h-4" strokeWidth={2} />
            This Month
          </button>
        </div>
      </div>

      {/* ── 5 KPI cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="New Leads"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.new_leads.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.new_leads.pct_change ?? null}
          icon={<Users className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)"
          iconColor="#0284C7"
        />
        <KpiCard
          label="First Contacts Made"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.first_contacts.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.first_contacts.pct_change ?? null}
          icon={<Send className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #FED7AA 0%, #FDBA74 100%)"
          iconColor="#EA580C"
        />
        <KpiCard
          label="Follow-ups Completed"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.followups_done.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.followups_done.pct_change ?? null}
          icon={<CheckCircle2 className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #DDD6FE 0%, #C4B5FD 100%)"
          iconColor="#7C3AED"
        />
        <KpiCard
          label="Leads Won"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : (k?.wins.value ?? 0).toLocaleString("en-IN")}
          pctChange={k?.wins.pct_change ?? null}
          icon={<Trophy className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #A7F3D0 0%, #6EE7B7 100%)"
          iconColor="#059669"
        />
        <KpiCard
          label="Revenue"
          value={isLoading ? <Skeleton className="h-8 w-20" /> : `₹${formatINR(k?.revenue.value ?? 0)}`}
          pctChange={k?.revenue.pct_change ?? null}
          icon={<IndianRupee className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #BBF7D0 0%, #86EFAC 100%)"
          iconColor="#059669"
        />
      </div>

      {/* ── 2-col: Funnel + Top Reps ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Funnel — wider (3/5) */}
        <div className="lg:col-span-3 glass-2 gloss-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[16px] font-semibold text-ink">Pipeline Funnel</h2>
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
              <div className="space-y-2.5">
                {funnel?.stages.map((s, i) => {
                  const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
                  const widthPct = Math.max(6, s.pct)  // ensure visibility for non-zero counts
                  return (
                    <div key={s.key} className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${color.swatch}`} />
                        <span className="text-[13px] text-ink truncate">{s.name}</span>
                      </div>
                      <div className="relative h-7 bg-slate-100/60 rounded-lg overflow-hidden">
                        {s.count > 0 && (
                          <div
                            className={`absolute inset-y-0 left-0 ${color.bar} rounded-lg`}
                            style={{
                              width:     `${widthPct}%`,
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.08)",
                            }}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 min-w-[100px] justify-end">
                        <span className="text-[14px] font-semibold tabular-nums text-ink">
                          {s.count.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[12px] text-ink-muted tabular-nums">({s.pct}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Conversion callout */}
              <div className="mt-5 flex items-start gap-3 rounded-xl px-4 py-3 bg-sky-50/70 border border-sky-100">
                <div className="w-9 h-9 rounded-lg bg-white/80 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4.5 h-4.5 text-sky-500" strokeWidth={2} />
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
        <div className="lg:col-span-2 glass-2 gloss-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-semibold text-ink">Top Performing Reps</h2>
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
                      <div className="h-1.5 bg-slate-100/80 rounded-full overflow-hidden">
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
        <div className="glass-2 gloss-edge rounded-2xl p-6">
          <h2 className="text-[16px] font-semibold text-ink mb-4">Active Sources</h2>
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
                      <span className="text-[13.5px] font-medium text-ink truncate">{s.name}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-semibold border rounded-full ${sty.pillCls}`}>
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
          <Link href="/leads" className="mt-5 pt-3 block text-center text-[12px] text-sky-600 font-semibold hover:text-sky-700 border-t border-hairline">
            View all leads →
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="glass-2 gloss-edge rounded-2xl p-6">
          <h2 className="text-[16px] font-semibold text-ink mb-4">Recent Activity</h2>
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
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: sty.bg,
                        boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85)",
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={2} style={{ color: sty.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink leading-tight">{a.title}</p>
                      <p className="text-[11.5px] text-ink-muted truncate mt-0.5">
                        {a.lead_name}{a.company ? ` · ${a.company}` : ""}
                      </p>
                    </div>
                    <span className="text-[11px] text-ink-faint tabular-nums shrink-0 mt-0.5">
                      {relTime(a.created_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Behaviour Health */}
        <div className="glass-2 gloss-edge rounded-2xl p-6">
          <h2 className="text-[16px] font-semibold text-ink mb-4">Behaviour Health</h2>
          {isLoading ? (
            <Skeleton className="h-[120px] w-[120px] rounded-full mx-auto" />
          ) : health ? (
            <>
              <HealthDonut pct={health.headline_pct} total={health.total} />
              <ul className="mt-4 space-y-2">
                <BandRow color="bg-emerald-500" label="Healthy"  count={health.healthy.count}  pct={health.healthy.pct}  icon={<Activity      className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.5} />} />
                <BandRow color="bg-orange-400"  label="At risk"  count={health.at_risk.count}  pct={health.at_risk.pct}  icon={<AlertTriangle className="w-3.5 h-3.5 text-orange-500"  strokeWidth={2.5} />} />
                <BandRow color="bg-red-500"     label="Missed"   count={health.missed.count}   pct={health.missed.pct}   icon={<ArrowUpRight  className="w-3.5 h-3.5 text-red-500"     strokeWidth={2.5} />} />
                <BandRow color="bg-slate-300"   label="Cold"     count={health.cold.count}     pct={health.cold.pct}     icon={<Snowflake     className="w-3.5 h-3.5 text-slate-500"   strokeWidth={2.5} />} />
              </ul>
              {health.headline_pct >= 60 ? (
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

function BandRow({ color, label, count, pct, icon: _icon }: {
  color: string; label: string; count: number; pct: number; icon: React.ReactNode
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
        <span className="text-[12.5px] text-ink-soft truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0 tabular-nums">
        <span className="text-[12.5px] font-semibold text-ink">{count}</span>
        <span className="text-[11px] text-ink-muted">({pct}%)</span>
      </div>
    </li>
  )
}
