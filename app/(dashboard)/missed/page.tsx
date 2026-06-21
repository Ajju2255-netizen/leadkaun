"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AlertCircle, Phone, X, IndianRupee, Trophy, Users, ArrowLeftRight,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MissedLead {
  id:                 string
  first_name:         string
  last_name:          string | null
  company_name:       string | null
  city:               string | null
  grade:              string
  expected_value:     number | null
  missed_at:          string | null
  hours_since_missed: number | null
  assigned_rep:       { id: string; first_name: string; last_name: string } | null
}

interface RepMissed {
  rep_id:       string
  first_name:   string
  last_name:    string
  missed_count: number
  missed_value: number
}

interface MissedData {
  total_count:             number
  total_value:             number
  recovered_this_week:     number
  value_vs_yesterday_pct:  number | null
  value_7d_pct_change:     number | null
  trend_7d:                number[]
  leads:                   MissedLead[]
  by_rep:                  RepMissed[]
}

async function fetchMissed(): Promise<MissedData> {
  const res = await fetch("/api/analytics/missed", { credentials: "include" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchTeam() {
  const res = await fetch("/api/team/members", { credentials: "include" })
  if (!res.ok) return { members: [] }
  return res.json() as Promise<{ members: { id: string; first_name: string; last_name: string | null }[] }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatINR(v: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(v))
}

function formatINRShort(v: number): string {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `${(v / 1_000).toFixed(0)}K`
  return formatINR(v)
}

function lastActivityText(missedAt: string | null, hours: number | null): string {
  if (!missedAt) return "—"
  const days = hours == null ? 0 : Math.floor(hours / 24)
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`
  if (hours == null || hours < 1) return "<1h ago"
  return `${hours}h ago`
}

const AVATAR_PALETTES = [
  { bg: "linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)" }, // mint
  { bg: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)" }, // sky
  { bg: "linear-gradient(180deg, #C4B5FD 0%, #8B5CF6 100%)" }, // violet
  { bg: "linear-gradient(180deg, #FDBA74 0%, #FB923C 100%)" }, // peach
  { bg: "linear-gradient(180deg, #F0ABFC 0%, #D946EF 100%)" }, // fuchsia
  { bg: "linear-gradient(180deg, #67E8F9 0%, #06B6D4 100%)" }, // cyan
  { bg: "linear-gradient(180deg, #F472B6 0%, #EC4899 100%)" }, // pink
  { bg: "linear-gradient(180deg, #FDE047 0%, #EAB308 100%)" }, // amber
]

function avatarPalette(seed: string) {
  const code = seed.charCodeAt(0) || 0
  return AVATAR_PALETTES[code % AVATAR_PALETTES.length]
}

// ── Sparkline — rose downward chart for "₹ at Risk Trend" ─────────────────────

function TrendSparkline({ data }: { data: number[] }) {
  // viewBox-only dimensions; the SVG scales to its container via w-full/h-full.
  // Padding leaves room for the end dot so nothing clips or overflows the card.
  const W = 120, H = 40, P = 8
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = (max - min) || 1
  const N = data.length
  const points = data.map((v, i) => {
    const x = P + (i / Math.max(1, N - 1)) * (W - 2 * P)
    const y = P + (1 - (v - min) / range) * (H - 2 * P)
    return [x, y] as const
  })
  const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const last = points[points.length - 1]
  const stroke = "#F43F5E"
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="block w-full h-full">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#FCA5A5" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FCA5A5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${points[0][0]},${H - P} ${path} ${last[0]},${H - P}`} fill="url(#trend-fill)" />
      <polyline points={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MissedPage() {
  const { data: session } = useCurrentUser()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<MissedData>({
    queryKey:        ["missed-opportunities"],
    queryFn:         fetchMissed,
    refetchInterval: 60_000,
  })

  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  fetchTeam,
    enabled:  isManager,
  })

  const [reassignTarget, setReassignTarget] = useState<MissedLead | null>(null)
  const [selectedRepId,  setSelectedRepId]  = useState("")
  const [reassigning,    setReassigning]    = useState(false)
  const [openLeadId,     setOpenLeadId]     = useState<string | null>(null)

  async function handleReassign() {
    if (!reassignTarget || !selectedRepId) return
    setReassigning(true)
    const res = await fetch(`/api/leads/${reassignTarget.id}/assign`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ rep_id: selectedRepId }),
    })
    if (res.ok) {
      const rep = teamData?.members.find((m) => m.id === selectedRepId)
      toast.success(`Reassigned to ${rep?.first_name ?? "rep"}`)
      queryClient.invalidateQueries({ queryKey: ["missed-opportunities"] })
    } else {
      toast.error("Failed to reassign")
    }
    setReassignTarget(null)
    setSelectedRepId("")
    setReassigning(false)
  }

  const leads      = data?.leads ?? []
  const total      = data?.total_count ?? 0
  const value      = data?.total_value ?? 0
  const recovered  = data?.recovered_this_week ?? 0
  const ydayPct    = data?.value_vs_yesterday_pct ?? null
  const trendPct   = data?.value_7d_pct_change ?? null
  const trendData  = data?.trend_7d ?? new Array(7).fill(0)
  const byRep      = data?.by_rep ?? []
  const sortedRep  = [...byRep].sort((a, b) => b.missed_value - a.missed_value).slice(0, 4)

  const sortedLeads = [...leads].sort(
    (a, b) => (b.expected_value ?? 0) - (a.expected_value ?? 0),
  )

  return (
    <div className="max-w-[1280px] mx-auto space-y-6 pb-12">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <AlertCircle className="w-6 h-6 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">
            Missed Opportunities
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Stale leads, valued by ₹ at risk — recover them before they&apos;re gone.
          </p>
        </div>
      </div>

      {/* ── Clean compact stat strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* ₹ at risk today */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-900/5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-4">
          <div className="flex items-center gap-1.5">
            <IndianRupee className="w-3.5 h-3.5 text-rose-500" strokeWidth={2.5} />
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">At risk today</p>
          </div>
          {isLoading ? <Skeleton className="h-7 w-24 mt-2" /> : (
            <p className="text-[24px] font-extrabold text-rose-600 tabular-nums leading-none mt-2 font-mono">₹{formatINRShort(value)}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            {total} stale
            {ydayPct != null && ydayPct !== 0 && (
              <span className={`ml-1.5 font-bold ${ydayPct < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {ydayPct < 0 ? "↓" : "↑"}{Math.abs(ydayPct)}% vs yest.
              </span>
            )}
          </p>
        </div>

        {/* 7-day trend */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-900/5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">7-day trend</p>
          <div className="flex items-end justify-between gap-2 mt-2">
            {trendPct == null ? (
              <p className="text-[24px] font-bold text-slate-300 tabular-nums leading-none">—</p>
            ) : (
              <p className={`text-[24px] font-extrabold tabular-nums leading-none font-mono ${trendPct >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {trendPct > 0 ? "+" : ""}{trendPct}%
              </p>
            )}
            <div className="w-[88px] h-9 shrink-0"><TrendSparkline data={trendData} /></div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">{trendPct == null ? "Need 7+ days" : "₹ at risk, 7 days"}</p>
        </div>

        {/* Recovered · 7d */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-900/5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-4">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Recovered · 7d</p>
          </div>
          {isLoading ? <Skeleton className="h-7 w-20 mt-2" /> : (
            <p className="text-[24px] font-extrabold text-emerald-600 tabular-nums leading-none mt-2 font-mono">₹{formatINRShort(recovered)}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-2">A/B leads won</p>
        </div>

        {/* Top stale by rep */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-900/5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="w-3.5 h-3.5 text-sky-500" strokeWidth={2.5} />
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{isManager ? "Top stale by rep" : "Stale pool"}</p>
          </div>
          {sortedRep.length === 0 ? (
            <p className="text-[12px] text-slate-400">No rep breakdown.</p>
          ) : (
            <div className="space-y-1.5">
              {sortedRep.slice(0, 3).map((r) => {
                const max = sortedRep[0]?.missed_value || 1
                const pct = Math.round((r.missed_value / max) * 100)
                return (
                  <div key={r.rep_id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-slate-600 truncate">{r.first_name}</p>
                      <span className="text-[10px] font-mono font-bold text-rose-600 tabular-nums shrink-0">₹{formatINRShort(r.missed_value)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-100 overflow-hidden mt-0.5">
                      <div className="h-full rounded-full bg-gradient-to-r from-rose-300 to-rose-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── High-value missed table ──────────────────────────────────────────── */}
      <div className="bg-white ring-1 ring-slate-900/5 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="text-[16px] font-bold text-slate-900">High-value missed opportunities</h2>
            {total > 0 && (
              <span className="inline-flex items-center justify-center text-[10px] font-black bg-gradient-to-br from-rose-500 to-rose-600 text-white rounded-full min-w-[20px] h-[20px] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                {total}
              </span>
            )}
          </div>
          {!isLoading && sortedLeads.length > 0 && (
            <button
              onClick={() => setOpenLeadId(sortedLeads[0].id)}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full shrink-0
                         bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600
                         text-white text-[12px] font-semibold transition-all active:scale-[0.97]
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]"
            >
              <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
              Call top-value lead
            </button>
          )}
        </div>

        {/* headers */}
        <div className="grid grid-cols-[1fr_120px_104px_118px_48px] gap-4 px-6 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 border-b border-slate-100">
          <span>Lead</span>
          <span>Last activity</span>
          <span>Status</span>
          <span className="text-right">₹ at risk</span>
          <span className="sr-only">Action</span>
        </div>

        {isLoading && (
          <div className="divide-y divide-slate-100">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_104px_118px_48px] gap-4 px-6 py-4 items-center">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-4 w-16 ml-auto" />
                <Skeleton className="h-7 w-7 rounded-full mx-auto" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && total === 0 && !error && (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_18px_rgba(16,185,129,0.32)]">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[14px] font-bold text-slate-900">No missed leads</p>
            <p className="text-[12px] text-slate-500 mt-1">Keep the queue moving and this stays empty.</p>
          </div>
        )}

        {!isLoading && sortedLeads.length > 0 && (
          <>
            <div className="divide-y divide-slate-100">
              {sortedLeads.map((lead) => {
                const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
                const display  = lead.company_name || fullName
                const seed     = (display[0] || "?").toUpperCase()
                const palette  = avatarPalette(seed)
                return (
                  <div
                    key={lead.id}
                    onClick={() => setOpenLeadId(lead.id)}
                    className="grid grid-cols-[1fr_120px_104px_118px_48px] gap-4 px-6 py-4 items-center hover:bg-rose-50/40 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-[13px] tabular-nums text-white"
                        style={{
                          background: palette.bg,
                          boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 6px rgba(15,23,42,0.10)",
                        }}
                      >
                        {seed}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-slate-900 truncate group-hover:text-rose-600 transition-colors">
                          {display}
                        </p>
                        {lead.company_name && fullName && fullName !== display && (
                          <p className="text-[11px] text-slate-400 truncate">{fullName}</p>
                        )}
                        {lead.assigned_rep && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">Owner · {lead.assigned_rep.first_name}</p>
                        )}
                      </div>
                    </div>

                    <span className="text-[13px] text-slate-600 tabular-nums">
                      {lastActivityText(lead.missed_at, lead.hours_since_missed)}
                    </span>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold w-fit border shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] bg-rose-50 text-rose-700 border-rose-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Stale · {lead.grade}
                    </span>

                    <span className="text-[14px] font-extrabold text-rose-600 tabular-nums text-right font-mono">
                      ₹{lead.expected_value ? formatINR(lead.expected_value) : "—"}
                    </span>

                    {/* Reassign owner (managers) — stops the row's open-detail click */}
                    <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                      {isManager && (
                        <button
                          onClick={() => setReassignTarget(lead)}
                          title="Reassign owner"
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-sky-600 hover:bg-sky-50 active:scale-95 transition-all"
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total row */}
            <div className="grid grid-cols-[1fr_120px_104px_118px_48px] gap-4 px-6 py-4 items-center border-t border-slate-100 bg-gradient-to-b from-rose-50/40 to-white/50">
              <span className="text-[13px] font-bold text-slate-900 col-span-3">Total ₹ at risk</span>
              <span className="text-[18px] font-extrabold text-rose-600 tabular-nums text-right font-mono">
                ₹{formatINR(value)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-2xl px-5 py-4 text-[13px] text-rose-700"
          style={{
            background: "rgba(254, 226, 226, 0.85)",
            border: "1px solid rgba(252, 165, 165, 0.55)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          Failed to load missed opportunities — please refresh.
        </div>
      )}

      {/* Lead detail — opens for any row + the banner's top-value CTA */}
      {openLeadId && (
        <LeadSlideOver
          leadId={openLeadId}
          onClose={() => {
            setOpenLeadId(null)
            queryClient.invalidateQueries({ queryKey: ["missed-opportunities"] })
            queryClient.invalidateQueries({ queryKey: ["missed-count"] })
            queryClient.invalidateQueries({ queryKey: ["queue"] })
          }}
        />
      )}

      {/* Reassign modal */}
      {reassignTarget && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="w-full max-w-sm glass-3 gloss-edge rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/30">
              <div>
                <p className="text-[16px] font-bold text-slate-900">Reassign lead</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {[reassignTarget.first_name, reassignTarget.last_name].filter(Boolean).join(" ")}
                </p>
              </div>
              <button
                onClick={() => { setReassignTarget(null); setSelectedRepId("") }}
                className="w-8 h-8 rounded-full glass-1 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Assign to</p>
              <ThemedSelect
                value={selectedRepId}
                onValueChange={setSelectedRepId}
                options={(teamData?.members ?? []).map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name ?? ""}`.trim() }))}
                placeholder="Select a rep…"
                aria-label="Assign to rep"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setReassignTarget(null); setSelectedRepId("") }}
                  className="flex-1 h-10 rounded-full glass-1 text-[13px] font-semibold text-slate-600 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReassign}
                  disabled={!selectedRepId || reassigning}
                  className="flex-1 h-10 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 text-white text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]"
                >
                  {reassigning ? "Reassigning…" : "Reassign"}
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

    </div>
  )
}
