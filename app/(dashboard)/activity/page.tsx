"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity as ActivityIcon, Phone, MessageSquare, Mail, Upload, Cog,
  ShieldCheck, TrendingDown, Trophy, ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { AvatarCircle } from "@/components/shared/AvatarCircle"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { DeltaChip } from "@/components/shared/DeltaChip"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/EmptyState"
import { timeAgo, formatRupee } from "@/lib/format"
import { COMPLIANCE_BAND_STYLE, type ComplianceBand } from "@/lib/activity/sla"
import type { SignalCategory } from "@/lib/activity/signal-labels"

// ── Types ─────────────────────────────────────────────────────────────────

type FeedItem = {
  id: string; type: string; label: string; category: SignalCategory
  lead_id: string | null; lead_name: string; company: string | null
  grade: string | null; rep_id: string | null; rep_name: string | null; created_at: string
}
type FeedResp = { items: FeedItem[]; page: number; page_size: number; total: number; has_more: boolean }

type ComplianceRep = {
  rep_id: string; name: string; role: string
  leads_total: number; contacted_within_sla: number; never_contacted: number; response_compliance_pct: number
  fu_on_time: number; fu_late: number; fu_breached: number; followup_adherence_pct: number
  escalations: number; compliance_pct: number; band: ComplianceBand
}
type ComplianceResp = {
  account: { response_compliance_pct: number; followup_adherence_pct: number; compliance_pct: number; band: ComplianceBand; escalations: number; leads_total: number }
  reps: ComplianceRep[]
}

type RepPerf = {
  id: string; first_name: string; last_name: string | null; role: string
  revenue_recovered: number; follow_up_completion_pct: number | null
  conversion_rate: number | null; rep_score: number
}
type Member = { id: string; first_name: string; last_name: string | null }

type Tab = "activity" | "compliance" | "recovery" | "performance"

const CAT_STYLE: Record<SignalCategory, { icon: typeof Phone; bg: string; color: string }> = {
  call:     { icon: Phone,         bg: "linear-gradient(180deg,#BAE6FD,#7DD3FC)", color: "#0284C7" },
  whatsapp: { icon: MessageSquare, bg: "linear-gradient(180deg,#A7F3D0,#6EE7B7)", color: "#059669" },
  email:    { icon: Mail,          bg: "linear-gradient(180deg,#DDD6FE,#C4B5FD)", color: "#7C3AED" },
  import:   { icon: Upload,        bg: "linear-gradient(180deg,#FED7AA,#FDBA74)", color: "#EA580C" },
  system:   { icon: Cog,           bg: "linear-gradient(180deg,#E2E8F0,#CBD5E1)", color: "#475569" },
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { data: currentUser } = useCurrentUser()
  const role     = currentUser?.user.role
  const isManager = role === "ADMIN" || role === "MANAGER"

  const TABS: { id: Tab; label: string; icon: typeof ActivityIcon }[] = isManager
    ? [
        { id: "activity",    label: "Activity",    icon: ActivityIcon },
        { id: "compliance",  label: "Compliance",  icon: ShieldCheck },
        { id: "recovery",    label: "Recovery",    icon: TrendingDown },
        { id: "performance", label: "Performance", icon: Trophy },
      ]
    : [
        { id: "activity",   label: "My Activity",   icon: ActivityIcon },
        { id: "compliance", label: "My Compliance", icon: ShieldCheck },
      ]

  const [tab, setTab] = useState<Tab>("activity")
  const [repFilter, setRepFilter] = useState<string>("all")
  const [page, setPage] = useState(1)

  // Team members for the rep filter (managers only)
  const { data: teamData } = useQuery<{ members: Member[] }>({
    queryKey: ["team-members"],
    queryFn: () => fetch("/api/team/members", { credentials: "include" }).then((r) => r.json()),
    enabled: isManager,
    staleTime: 60_000,
  })
  const members = teamData?.members ?? []

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(14,165,233,0.25)" }}
        >
          <ActivityIcon className="w-6 h-6 text-sky-700" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Activity</h1>
          <p className="text-[14px] text-ink-soft mt-2 leading-relaxed max-w-[560px]">
            {isManager
              ? "How the team is doing — what they did, whether they hit SLAs, what they recovered, and who's performing."
              : "Your activity and how you're tracking against follow-up and response SLAs."}
          </p>
        </div>
      </div>

      {/* Tab bar + rep filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100/70 ring-1 ring-slate-900/5">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold transition-all ${active ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-900/5" : "text-ink-soft hover:text-ink"}`}
              >
                <Icon className="w-4 h-4" strokeWidth={2.2} /> {t.label}
              </button>
            )
          })}
        </div>
        {isManager && tab === "activity" && members.length > 0 && (
          <ThemedSelect
            variant="pill"
            value={repFilter}
            onValueChange={(v) => { setRepFilter(v); setPage(1) }}
            options={[{ value: "all", label: "All reps" }, ...members.map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name ?? ""}`.trim() }))]}
            className="max-w-[180px]"
            aria-label="Filter by rep"
          />
        )}
      </div>

      {tab === "activity"    && <ActivityFeed repFilter={isManager ? repFilter : "all"} page={page} setPage={setPage} />}
      {tab === "compliance"  && <CompliancePanel />}
      {tab === "recovery"    && isManager && <RecoveryPanel />}
      {tab === "performance" && isManager && <PerformancePanel />}
    </div>
  )
}

// ── Activity feed ───────────────────────────────────────────────────────────

function ActivityFeed({ repFilter, page, setPage }: { repFilter: string; page: number; setPage: (n: number) => void }) {
  const { data, isLoading } = useQuery<FeedResp>({
    queryKey: ["activity-feed", repFilter, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page) })
      if (repFilter && repFilter !== "all") p.set("rep_id", repFilter)
      return fetch(`/api/activity/feed?${p}`, { credentials: "include" }).then((r) => r.json())
    },
  })

  if (isLoading) {
    return <div className="glass-2 gloss-edge rounded-2xl p-4 space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
  }
  if (!data || data.items.length === 0) {
    return <div className="glass-2 gloss-edge rounded-2xl p-6"><EmptyState icon={ActivityIcon} title="No activity yet" description="Calls, WhatsApp, and imports will appear here as your team works leads." /></div>
  }

  return (
    <div className="glass-2 gloss-edge rounded-2xl overflow-hidden">
      <div className="divide-y divide-hairline">
        {data.items.map((it) => {
          const s = CAT_STYLE[it.category] ?? CAT_STYLE.system
          const Icon = s.icon
          return (
            <div key={it.id} className="flex items-center gap-3 px-4 py-3 hover:bg-sky-50/40 transition-colors">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}>
                <Icon className="w-4 h-4" style={{ color: s.color }} strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink leading-snug truncate">
                  <span className="font-semibold">{it.label}</span>
                  {it.lead_name !== "—" && <span className="text-ink-soft"> · {it.lead_name}</span>}
                  {it.company && <span className="text-ink-muted"> · {it.company}</span>}
                </p>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  {it.rep_name ?? "System"} · {timeAgo(it.created_at)}
                </p>
              </div>
              {it.grade && <GradeBadge grade={it.grade as "A"} size="sm" />}
            </div>
          )
        })}
      </div>
      {/* Pager */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-hairline bg-white/40">
        <span className="text-[11px] text-ink-muted tabular-nums">{data.total} events</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-white/70 disabled:opacity-30 disabled:pointer-events-none transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[12px] font-semibold text-ink-soft tabular-nums px-1">{page}</span>
          <button onClick={() => setPage(page + 1)} disabled={!data.has_more}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-white/70 disabled:opacity-30 disabled:pointer-events-none transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Compliance ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-900/5 p-4">
      <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-[0.06em]">{label}</p>
      <p className="text-[24px] font-bold text-ink tabular-nums mt-1 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-ink-muted mt-1.5">{sub}</p>}
    </div>
  )
}

function CompliancePanel() {
  const { data, isLoading } = useQuery<ComplianceResp>({
    queryKey: ["activity-compliance"],
    queryFn: () => fetch("/api/activity/compliance", { credentials: "include" }).then((r) => r.json()),
  })

  if (isLoading) return <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
  if (!data) return null

  const a = data.account
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Overall compliance" value={`${a.compliance_pct}%`} sub={COMPLIANCE_BAND_STYLE[a.band].label} />
        <StatTile label="Response SLA" value={`${a.response_compliance_pct}%`} sub={`${a.leads_total} leads this month`} />
        <StatTile label="Follow-up adherence" value={`${a.followup_adherence_pct}%`} sub={`${a.escalations} escalations`} />
      </div>

      {data.reps.length === 0 ? (
        <div className="glass-2 gloss-edge rounded-2xl p-6"><EmptyState icon={ShieldCheck} title="No compliance data yet" description="Once leads are assigned and follow-ups scheduled this month, adherence appears here." /></div>
      ) : (
        <div className="glass-2 gloss-edge rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-hairline">
                {["Rep", "Response SLA", "Follow-up adherence", "Escalations", "Status"].map((h, i) => (
                  <th key={h} className={`py-2.5 px-4 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.08em] ${i === 0 ? "text-left" : i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.reps.map((r) => {
                const band = COMPLIANCE_BAND_STYLE[r.band]
                return (
                  <tr key={r.rep_id} className="border-b border-hairline last:border-0 hover:bg-sky-50/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <AvatarCircle seed={r.name} size="sm" />
                        <span className="text-[13px] font-semibold text-ink">{r.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 w-[200px]">
                      <ScoreBar value={r.response_compliance_pct} type={r.response_compliance_pct >= 85 ? "intent" : "default"} showValue />
                      <p className="text-[10px] text-ink-muted mt-1">{r.contacted_within_sla}/{r.leads_total} in SLA{r.never_contacted > 0 ? ` · ${r.never_contacted} never contacted` : ""}</p>
                    </td>
                    <td className="py-3 px-4 w-[200px]">
                      <ScoreBar value={r.followup_adherence_pct} type={r.followup_adherence_pct >= 85 ? "intent" : "default"} showValue />
                      <p className="text-[10px] text-ink-muted mt-1">{r.fu_on_time} on time · {r.fu_late} late · {r.fu_breached} breached</p>
                    </td>
                    <td className="py-3 px-4 text-[13px] tabular-nums font-semibold text-ink">{r.escalations > 0 ? <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="w-3.5 h-3.5" />{r.escalations}</span> : "—"}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${band.text} ${band.bg} ${band.ring}`}>{r.compliance_pct}% · {band.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Recovery (managers) ─────────────────────────────────────────────────────

function RecoveryPanel() {
  const { data, isLoading } = useQuery<{ total_count: number; total_value: number; recovered_this_week: number; value_7d_pct_change: number | null; by_rep: { rep_id: string; first_name: string; last_name: string | null; missed_count: number; missed_value: number }[] }>({
    queryKey: ["missed-opportunities"],
    queryFn: () => fetch("/api/analytics/missed", { credentials: "include" }).then((r) => r.json()),
  })
  if (isLoading) return <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Recovered this week" value={`${formatRupee(data.recovered_this_week)}`} />
        <StatTile label="At risk now" value={`${formatRupee(data.total_value)}`} sub={`${data.total_count} missed leads`} />
        <StatTile label="7-day pool change" value={data.value_7d_pct_change == null ? "—" : `${data.value_7d_pct_change > 0 ? "+" : ""}${data.value_7d_pct_change}%`} />
      </div>
      {data.by_rep.length > 0 && (
        <div className="glass-2 gloss-edge rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-hairline">
              {["Rep", "Missed leads", "Value at risk"].map((h, i) => <th key={h} className={`py-2.5 px-4 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.08em] ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.by_rep.sort((a, b) => b.missed_value - a.missed_value).map((r) => {
                const name = `${r.first_name} ${r.last_name ?? ""}`.trim() || "Unassigned"
                return (
                <tr key={r.rep_id} className="border-b border-hairline last:border-0 hover:bg-sky-50/30 transition-colors">
                  <td className="py-3 px-4"><div className="flex items-center gap-2.5"><AvatarCircle seed={name} size="sm" /><span className="text-[13px] font-semibold text-ink">{name}</span></div></td>
                  <td className="py-3 px-4 text-right text-[13px] tabular-nums text-ink">{r.missed_count}</td>
                  <td className="py-3 px-4 text-right text-[13px] tabular-nums font-semibold text-rose-600">{formatRupee(r.missed_value)}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Performance (managers) ───────────────────────────────────────────────────

function PerformancePanel() {
  const { data, isLoading } = useQuery<{ reps: RepPerf[] }>({
    queryKey: ["rep-tracking"],
    queryFn: () => fetch("/api/analytics/rep-tracking", { credentials: "include" }).then((r) => r.json()),
  })
  if (isLoading) return <div className="glass-2 gloss-edge rounded-2xl p-4 space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
  if (!data) return null
  const reps = [...(data.reps ?? [])].sort((a, b) => b.rep_score - a.rep_score)
  if (reps.length === 0) return <div className="glass-2 gloss-edge rounded-2xl p-6"><EmptyState icon={Trophy} title="No performance data yet" description="Rep scores appear once your team starts working leads this month." /></div>

  return (
    <div className="glass-2 gloss-edge rounded-2xl overflow-hidden">
      <div className="divide-y divide-hairline">
        {reps.map((r, i) => {
          const name = `${r.first_name} ${r.last_name ?? ""}`.trim()
          return (
            <div key={r.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-sky-50/30 transition-colors">
              <span className="w-6 text-center text-[13px] font-bold text-ink-muted tabular-nums shrink-0">{i + 1}</span>
              <AvatarCircle seed={name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink truncate">{name}{i === 0 && <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Leader</span>}</p>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-muted tabular-nums">
                  <span>{formatRupee(r.revenue_recovered)} won</span>
                  {r.follow_up_completion_pct != null && <span>{r.follow_up_completion_pct}% follow-ups</span>}
                  {r.conversion_rate != null && <span>{r.conversion_rate}% conv.</span>}
                </div>
              </div>
              <div className="w-[140px] shrink-0">
                <ScoreBar value={r.rep_score} type="intent" label="Score" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
