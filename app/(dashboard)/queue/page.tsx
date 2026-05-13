"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useQueue } from "@/hooks/useQueue"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { QueueLeadRow } from "@/components/queue/QueueLeadRow"
import { QueueSidebar } from "@/components/queue/QueueSidebar"
import { QueueTopFive } from "@/components/queue/QueueTopFive"
import { CompleteActionsBanner } from "@/components/queue/CompleteActionsBanner"
import { QueueGradeTabs, type GradeTab } from "@/components/queue/QueueGradeTabs"
import {
  QueueFilters,
  filtersAreActive,
  type QueueFiltersState,
} from "@/components/queue/QueueFilters"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { BackToTopButton } from "@/components/shared/BackToTopButton"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckCircle2, Users, Search, X, ChevronDown, SlidersHorizontal,
} from "lucide-react"
import type { QueueLead } from "@/hooks/useQueue"

async function fetchSources() {
  const res = await fetch("/api/lead-sources", { credentials: "include" })
  if (!res.ok) return { sources: [] }
  return res.json() as Promise<{ sources: { id: string; name: string; key: string }[] }>
}

async function fetchTeam() {
  const res = await fetch("/api/team/members", { credentials: "include" })
  if (!res.ok) return { members: [] }
  return res.json() as Promise<{ members: { id: string; first_name: string; last_name: string | null }[] }>
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const { data: session } = useCurrentUser()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"
  const searchParams = useSearchParams()
  const router       = useRouter()
  const pathname     = usePathname()

  // Read initial state from URL search params so views are shareable
  const [repFilter,    setRepFilter]    = useState<string | undefined>(searchParams.get("rep") ?? undefined)
  const [sourceFilter, setSourceFilter] = useState<string>(searchParams.get("source") ?? "all")
  const [openLeadId,   setOpenLeadId]   = useState<string | null>(null)
  const [search,       setSearch]       = useState(searchParams.get("q") ?? "")
  const [gradeTab,     setGradeTab]     = useState<GradeTab>((searchParams.get("grade") as GradeTab) ?? "all")
  const [filtersOpen,  setFiltersOpen]  = useState(false)
  const [filters,      setFilters]      = useState<QueueFiltersState>(() => {
    const channels = new Set<"whatsapp" | "phone">()
    const ch = searchParams.get("channels")
    if (ch) ch.split(",").forEach((c) => {
      if (c === "whatsapp" || c === "phone") channels.add(c)
    })
    return {
      channels,
      hideContactedToday: searchParams.get("hideContacted") === "1",
    }
  })

  // Persist filter state to URL — shareable / bookmarkable views
  useEffect(() => {
    const sp = new URLSearchParams()
    if (search.trim())                sp.set("q",      search.trim())
    if (gradeTab     !== "all")       sp.set("grade",  gradeTab)
    if (sourceFilter !== "all")       sp.set("source", sourceFilter)
    if (repFilter)                    sp.set("rep",    repFilter)
    if (filters.channels.size > 0)    sp.set("channels", Array.from(filters.channels).join(","))
    if (filters.hideContactedToday)   sp.set("hideContacted", "1")
    const qs   = sp.toString()
    const next = qs ? `${pathname}?${qs}` : pathname
    router.replace(next, { scroll: false })
  }, [pathname, router, search, gradeTab, sourceFilter, repFilter, filters])

  const { data, isLoading, error } = useQueue(repFilter)
  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  fetchTeam,
    enabled:  isManager,
  })
  const { data: sourcesData } = useQuery({
    queryKey: ["lead-sources"],
    queryFn:  fetchSources,
    staleTime: 5 * 60 * 1000,
  })

  const leads = useMemo<QueueLead[]>(() => data?.leads ?? [], [data?.leads])
  const kpis  = data?.kpis

  // Filter by search + source + advanced filters (server-side already ai_score sorted)
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
    if (sourceFilter !== "all") {
      out = out.filter((l) => l.source?.id === sourceFilter)
    }
    if (filters.channels.size > 0) {
      out = out.filter((l) => l.channel && filters.channels.has(l.channel as "whatsapp" | "phone"))
    }
    if (filters.hideContactedToday) {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
      out = out.filter((l) => {
        if (!l.last_action_at) return true
        return new Date(l.last_action_at).getTime() < startOfDay.getTime()
      })
    }
    return out
  }, [leads, search, sourceFilter, filters])

  const topFive = filteredLeads.slice(0, 5)
  const topFiveIds = useMemo(() => new Set(topFive.map((l) => l.id)), [topFive])

  // Lead set shown in the section BELOW the Top-5 hero.
  // On "all" tab → everything except the Top-5 (avoids visible duplication).
  // On a grade tab → all leads of that grade (including those in Top-5, so the
  //                  user can browse the full set for that grade).
  const belowList = useMemo(() => {
    if (gradeTab === "all") {
      return filteredLeads.filter((l) => !topFiveIds.has(l.id))
    }
    return filteredLeads.filter((l) => l.grade === gradeTab)
  }, [filteredLeads, gradeTab, topFiveIds])

  // Counts per tab — drives the badge inside each pill, hides empty grades
  const counts = useMemo(() => {
    const c: Partial<Record<GradeTab, number>> = {
      all: Math.max(0, filteredLeads.length - topFive.length),
    }
    for (const lead of filteredLeads) {
      const k = lead.grade as GradeTab
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [filteredLeads, topFive.length])

  const totalLeads = filteredLeads.length

  return (
    <>
      {/* xl+: fixed-height layout where only the leads list scrolls.
          Below xl: normal page scroll so cramped viewports get full height. */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6 items-start
                      xl:h-full xl:max-h-full xl:overflow-hidden">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <QueueSidebar kpis={kpis} loading={isLoading} />

        {/* ── MAIN COLUMN ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 min-w-0 xl:h-full xl:min-h-0 xl:overflow-hidden">

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

              {/* All Sources dropdown — wired to /api/lead-sources */}
              <div className="relative">
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                  className="h-9 pl-3 pr-8 rounded-full glass-1 border border-white/70 text-[12px] font-semibold
                             text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                             focus:border-sky-400 appearance-none cursor-pointer transition-all max-w-[160px]">
                  <option value="all">All Sources</option>
                  {sourcesData?.sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none z-10" />
              </div>

              {/* Filters button + popover */}
              <div className="relative">
                <button
                  onClick={() => setFiltersOpen((o) => !o)}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-9 px-3 rounded-full glass-1 border text-[12px] font-semibold transition-all",
                    filtersAreActive(filters)
                      ? "bg-sky-50 border-sky-200 text-sky-700"
                      : "border-white/70 text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filters
                  {filtersAreActive(filters) && (
                    <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-600 text-white text-[10px] font-bold tabular-nums">
                      {filters.channels.size + (filters.hideContactedToday ? 1 : 0)}
                    </span>
                  )}
                </button>
                <QueueFilters
                  open={filtersOpen}
                  onClose={() => setFiltersOpen(false)}
                  state={filters}
                  onChange={setFilters}
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-2xl glass-2 gloss-edge px-4 py-3 text-[13px] text-rose-700 border border-rose-200/60">
              <span className="font-semibold">Failed to load queue</span> — please refresh.
            </div>
          )}

          {/* Loading skeletons */}
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

          {/* Top-5 ranked hero — ALWAYS visible, anchors the page across tabs */}
          {!isLoading && topFive.length > 0 && (
            <QueueTopFive leads={topFive} onLeadClick={setOpenLeadId} />
          )}

          {/* CTA banner — also always visible */}
          {!isLoading && kpis && kpis.top_three_potential_revenue > 0 && (
            <CompleteActionsBanner topThreeRevenue={kpis.top_three_potential_revenue} />
          )}

          {/* Grade tabs */}
          {!isLoading && totalLeads > 5 && (
            <QueueGradeTabs active={gradeTab} onChange={setGradeTab} counts={counts} />
          )}

          {/* Scrollable list area — only this scrolls on xl+ */}
          {!isLoading && (belowList.length > 0 || gradeTab !== "all") && (
            <div
              data-queue-scroll
              className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto -mx-1 px-1 pb-3"
            >
              {belowList.length > 0 ? (
                <div className="space-y-2">
                  {belowList.map((lead) => (
                    <QueueLeadRow key={lead.id} lead={lead} onClick={setOpenLeadId} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl glass-1 px-5 py-8 text-center text-[13px] text-ink-muted">
                  No Grade {gradeTab} leads right now.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Slide-over drawer */}
      {openLeadId && (
        <LeadSlideOver leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
      )}

      {/* Back-to-top floating button */}
      <BackToTopButton />
    </>
  )
}
