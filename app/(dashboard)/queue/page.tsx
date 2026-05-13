"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useQueue } from "@/hooks/useQueue"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { QueueLeadRow } from "@/components/queue/QueueLeadRow"
import { QueueSidebar } from "@/components/queue/QueueSidebar"
import { QueueTopFive } from "@/components/queue/QueueTopFive"
import { CompleteActionsBanner } from "@/components/queue/CompleteActionsBanner"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckCircle2, Users, Search, X, ChevronDown, SlidersHorizontal,
} from "lucide-react"
import type { QueueLead } from "@/hooks/useQueue"

async function fetchTeam() {
  const res = await fetch("/api/team/members", { credentials: "include" })
  if (!res.ok) return { members: [] }
  return res.json() as Promise<{ members: { id: string; first_name: string; last_name: string | null }[] }>
}

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  { grade: "A", label: "Grade A — Immediate",  defaultOpen: true,  dot: "bg-emerald-500" },
  { grade: "B", label: "Grade B — Act Today",  defaultOpen: true,  dot: "bg-sky-500"     },
  { grade: "C", label: "Grade C — Nurture",    defaultOpen: false, dot: "bg-orange-400"  },
  { grade: "D", label: "Grade D",              defaultOpen: false, dot: "bg-amber-500"   },
  { grade: "E", label: "Grade E — Disqualify", defaultOpen: false, dot: "bg-rose-500"    },
]

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

// ── Grade Section ─────────────────────────────────────────────────────────────

function GradeSection({
  label, leads, totalValue, defaultOpen, onSelect, dot,
}: {
  grade: string
  label: string
  leads: QueueLead[]
  totalValue: number
  defaultOpen: boolean
  onSelect: (id: string) => void
  dot: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (leads.length === 0) return null

  return (
    <div className="space-y-3">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 group py-0.5 focus:outline-none">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] shrink-0
                         group-hover:text-slate-700 transition-colors">
          {label}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-slate-200 via-slate-200 to-transparent
                        group-hover:from-slate-300 transition-colors" />
        <div className="flex items-center gap-2 shrink-0">
          {totalValue > 0 && (
            <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{formatValue(totalValue)}</span>
          )}
          <span className="text-[11px] font-bold text-slate-700 tabular-nums px-1.5 py-0.5 rounded-full
                           bg-white/60 border border-slate-200/60">{leads.length}</span>
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="space-y-2">
          {leads.map((lead) => (
            <QueueLeadRow key={lead.id} lead={lead} onClick={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const { data: session } = useCurrentUser()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"
  const [repFilter,    setRepFilter]    = useState<string | undefined>(undefined)
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [openLeadId,   setOpenLeadId]   = useState<string | null>(null)
  const [search,       setSearch]       = useState("")

  const { data, isLoading, error } = useQueue(repFilter)
  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  fetchTeam,
    enabled:  isManager,
  })

  const leads = useMemo<QueueLead[]>(() => data?.leads ?? [], [data?.leads])
  const kpis  = data?.kpis

  // Filter leads by search + source (server-side leads are already ai_score sorted)
  const filteredLeads = useMemo(() => {
    let out = leads
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter((l) =>
        `${l.first_name} ${l.last_name ?? ""}`.toLowerCase().includes(q) ||
        (l.company_name?.toLowerCase().includes(q) ?? false) ||
        (l.phone?.includes(q) ?? false)
      )
    }
    // sourceFilter currently a stub — wire up when source dropdown is populated
    if (sourceFilter !== "all") {
      out = out.filter((l) => l.stage?.id === sourceFilter)
    }
    return out
  }, [leads, search, sourceFilter])

  const topFive = filteredLeads.slice(0, 5)

  // Grade-grouped sections — group the filtered set, render below the hero
  const grouped = useMemo(() => {
    const g: Record<string, QueueLead[]> = {}
    for (const lead of filteredLeads) {
      if (!g[lead.grade]) g[lead.grade] = []
      g[lead.grade].push(lead)
    }
    return g
  }, [filteredLeads])

  const totalLeads = filteredLeads.length

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6 items-start">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <QueueSidebar kpis={kpis} loading={isLoading} />

        {/* ── MAIN COLUMN ───────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">

          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[12px] text-ink-muted">
              {isLoading ? "Loading…" : (
                <>
                  <span className="font-bold text-slate-700 tabular-nums">{totalLeads}</span> active leads
                  {kpis ? <> · <span className="font-bold text-sky-700 tabular-nums">{kpis.high_priority_count}</span> high priority</> : null}
                </>
              )}
            </p>

            <div className="flex items-center gap-2 ml-auto">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads…"
                  className="h-9 pl-9 pr-3 rounded-full glass-1 border border-white/70 text-[12px]
                             text-slate-900 placeholder:text-slate-400 focus:outline-none
                             focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 w-[180px] transition-all" />
                {search && (
                  <button onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 z-10">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Rep filter — managers only */}
              {isManager && teamData && teamData.members.length > 0 && (
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
                  <select value={repFilter ?? ""} onChange={(e) => setRepFilter(e.target.value || undefined)}
                    className="h-9 pl-9 pr-8 rounded-full glass-1 border border-white/70 text-[12px] font-semibold
                               text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                               focus:border-sky-400 appearance-none cursor-pointer transition-all">
                    <option value="">All reps</option>
                    {teamData.members.map((m) => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name ?? ""}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none z-10" />
                </div>
              )}

              {/* All Sources dropdown (stub for now — preserves API surface) */}
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                className="h-9 px-3 rounded-full glass-1 border border-white/70 text-[12px] font-semibold
                           text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                           focus:border-sky-400 appearance-none cursor-pointer transition-all">
                <option value="all">All Sources</option>
              </select>

              {/* Filters button — future-stub */}
              <button
                disabled
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full glass-1 border border-white/70 text-[12px] font-semibold text-slate-500 opacity-70 cursor-not-allowed"
                title="More filters coming soon"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-2xl glass-2 gloss-edge px-4 py-3 text-[13px] text-rose-700 border border-rose-200/60">
              <span className="font-semibold">Failed to load queue</span> — please refresh.
            </div>
          )}

          {/* Loading skeletons for the Top-5 */}
          {isLoading && (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />)}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && totalLeads === 0 && !error && !search.trim() && (
            <div className="rounded-2xl glass-3 gloss-edge px-6 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white
                              bg-gradient-to-br from-emerald-400 to-emerald-500
                              shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_rgba(16,185,129,0.32)]">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <p className="text-[16px] font-semibold text-slate-900">All clear — queue is empty</p>
              <p className="text-[12px] text-slate-500 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                No active leads to chase. Import a fresh batch or wait for new inquiries to land.
              </p>
              <a href="/leads/import"
                className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-full text-white
                           bg-gradient-to-b from-sky-400 to-sky-500 text-[12px] font-semibold
                           shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                           transition-all active:scale-[0.98]">
                Import leads →
              </a>
            </div>
          )}

          {/* No search results */}
          {!isLoading && totalLeads === 0 && search.trim() && (
            <div className="rounded-2xl glass-2 gloss-edge px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-slate-700">No results for &ldquo;{search}&rdquo;</p>
              <button onClick={() => setSearch("")}
                className="mt-3 text-[12px] text-sky-600 hover:text-sky-700 font-semibold">
                Clear search
              </button>
            </div>
          )}

          {/* Top-5 ranked hero */}
          {!isLoading && topFive.length > 0 && (
            <QueueTopFive leads={topFive} onLeadClick={setOpenLeadId} />
          )}

          {/* CTA banner */}
          {!isLoading && kpis && kpis.top_three_potential_revenue > 0 && (
            <CompleteActionsBanner topThreeRevenue={kpis.top_three_potential_revenue} />
          )}

          {/* Grade-grouped sections (existing pattern) */}
          {!isLoading && totalLeads > 5 && (
            <div className="space-y-5 pt-1">
              {SECTIONS.map((section) => {
                const sectionLeads = grouped[section.grade] ?? []
                const totalValue   = sectionLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0)
                return (
                  <GradeSection key={section.grade}
                    grade={section.grade}
                    label={section.label}
                    leads={sectionLeads}
                    totalValue={totalValue}
                    defaultOpen={section.defaultOpen}
                    onSelect={setOpenLeadId}
                    dot={section.dot} />
                )
              })}
            </div>
          )}

        </div>
      </div>

      {/* Slide-over drawer — opens when any row (Top-5 or QueueCard) is clicked */}
      {openLeadId && (
        <LeadSlideOver leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
      )}
    </>
  )
}
