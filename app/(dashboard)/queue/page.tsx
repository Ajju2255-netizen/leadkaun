"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentProps } from "react"
import { cn } from "@/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { trackFunnel } from "@/lib/analytics/funnel"
import { SAMPLE_WORKSPACE_SLUG } from "@/lib/workspace/provision"
import { switchWorkspace } from "@/lib/workspace/switch"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useQueue } from "@/hooks/useQueue"
import { useQueueRealtime } from "@/hooks/useQueueRealtime"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { QueueLeadRow } from "@/components/queue/QueueLeadRow"
import { QueueGradeTabs, type GradeTab } from "@/components/queue/QueueGradeTabs"
import {
  QueueFilters,
  filtersAreActive,
  type QueueFiltersState,
} from "@/components/queue/QueueFilters"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { BackToTopButton } from "@/components/shared/BackToTopButton"
import { DeltaChip } from "@/components/shared/DeltaChip"
import { EmptyState } from "@/components/shared/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRupee } from "@/lib/format"
import {
  Users, Search, X, SlidersHorizontal, Upload, Inbox, Flame, Zap,
  PhoneCall, IndianRupee, Trophy, ChevronLeft, ChevronRight, type LucideIcon,
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

const PER_PAGE = 12

// ── Small presentational helpers ───────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, tintBg, tintFg, delta, caption,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  tintBg: string
  tintFg: string
  delta?: number | null
  caption?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-3.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("w-8 h-8 rounded-lg grid place-items-center shrink-0", tintBg)}>
          <Icon className={cn("w-4 h-4", tintFg)} strokeWidth={2} />
        </span>
        <span className="text-[12px] font-medium text-ink-soft truncate">{label}</span>
      </div>
      <div className="mt-3 text-[23px] font-bold tabular-nums text-ink leading-none">{value}</div>
      <div className="mt-2 flex items-center gap-1.5 min-h-[16px]">
        <DeltaChip delta={delta} />
        {caption && <span className="text-[11.5px] text-ink-muted truncate">{caption}</span>}
      </div>
    </div>
  )
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn("py-2.5 px-3 text-left text-[12px] font-semibold text-ink-soft whitespace-nowrap", className)}>
      {children}
    </th>
  )
}

function PageBtn({ active, className, ...props }: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "min-w-[32px] h-8 px-2 inline-flex items-center justify-center rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        active ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100",
        className,
      )}
    />
  )
}

/** Compact page-number window: 1 … n-1 n n+1 … last */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | "…")[] = [1]
  const lo = Math.max(2, current - 1)
  const hi = Math.min(total - 1, current + 1)
  if (lo > 2) out.push("…")
  for (let p = lo; p <= hi; p++) out.push(p)
  if (hi < total - 1) out.push("…")
  out.push(total)
  return out
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const { data: session } = useCurrentUser()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"
  const searchParams = useSearchParams()
  const router       = useRouter()
  const queryClient  = useQueryClient()
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

  // Realtime updates — pushes invalidations when leads/signals change for
  // this account. Throttled inside the hook. Falls back to 30s polling.
  useQueueRealtime(session?.account?.id)

  const leads = useMemo<QueueLead[]>(() => data?.leads ?? [], [data?.leads])

  /**
   * Activation funnel: the user has actually reached the prioritisation
   * experience with leads in it.
   *
   * This deliberately reads the UNFILTERED list. A user who lands here with
   * leads but an active grade/source filter that matches none of them has
   * still reached the product; the filter is their choice, not a failure to
   * activate. Fired once per mount (the server also dedupes per account), so
   * re-renders and pagination cannot inflate it.
   */
  const firedPriorityView = useRef(false)
  const inSampleWorkspace = session?.workspace?.slug === SAMPLE_WORKSPACE_SLUG
  // Only worth pointing at the examples from somewhere that is not them. In the
  // sample itself an empty queue means the examples were removed, and telling
  // someone their examples are elsewhere while they stand in them is nonsense.
  const sampleWs = inSampleWorkspace
    ? undefined
    : session?.workspaces?.find((w) => w.slug === SAMPLE_WORKSPACE_SLUG)

  /** Hop to the example leads, so an empty queue is not a dead end. */
  async function viewSample() {
    if (!sampleWs) return
    await switchWorkspace(sampleWs.id, queryClient)
    router.refresh()
  }

  useEffect(() => {
    if (firedPriorityView.current || leads.length === 0) return
    // Activation isolation: the Sample workspace always has leads, so without
    // this every visitor who merely explored the demo would look activated.
    // The server enforces the same rule; this just avoids a pointless request.
    if (inSampleWorkspace) return
    firedPriorityView.current = true
    trackFunnel("first_priority_viewed", { leads: leads.length })
  }, [leads.length, inSampleWorkspace])
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

  const hotCount = useMemo(() => filteredLeads.filter((l) => l.is_hot_signal).length, [filteredLeads])

  // Which leads the table shows: the whole filtered set, or one grade.
  const tabLeads = useMemo(() => {
    if (gradeTab === "all") return filteredLeads
    return filteredLeads.filter((l) => l.grade === gradeTab)
  }, [filteredLeads, gradeTab])

  // Counts per grade pill.
  const counts = useMemo(() => {
    const c: Partial<Record<GradeTab, number>> = { all: filteredLeads.length }
    for (const lead of filteredLeads) {
      const k = lead.grade as GradeTab
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [filteredLeads])

  const totalLeads = filteredLeads.length

  // Client-side pagination over the visible set.
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [gradeTab, search, sourceFilter, repFilter, filters])
  const pageCount = Math.max(1, Math.ceil(tabLeads.length / PER_PAGE))
  const safePage  = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * PER_PAGE
  const pageLeads = tabLeads.slice(pageStart, pageStart + PER_PAGE)

  // Changing page scrolls back to the top of the table (the shell's main area
  // scrolls, so scrollIntoView is used rather than window.scrollTo).
  const tableRef = useRef<HTMLDivElement>(null)
  function goToPage(p: number) {
    setPage(Math.min(Math.max(1, p), pageCount))
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <>
      <div className="flex flex-col gap-5 min-w-0 pb-10">

        {/* ── HEADER ────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-[24px] font-semibold text-ink tracking-[-0.02em] leading-tight">Priority Queue</h1>
          <a
            href="/leads/import"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[13px] font-semibold transition-colors active:scale-[0.98]"
          >
            <Upload className="w-4 h-4" /> Import leads
          </a>
        </header>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-rose-200/70 bg-rose-50/50 px-4 py-3 text-[13px] text-rose-700">
            <span className="font-semibold">Failed to load queue</span> — please refresh.
          </div>
        )}

        {/* ── QUICK STATS ───────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5">
          <h2 className="text-[14px] font-semibold text-ink mb-3.5">Quick stats</h2>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard icon={Inbox}       label="Total leads"     value={data?.total ?? totalLeads}                       tintBg="bg-slate-100" tintFg="text-slate-500"  caption="in your queue" />
              <StatCard icon={Flame}       label="High priority"   value={kpis?.high_priority_count ?? 0}                  tintBg="bg-rose-50"   tintFg="text-rose-500"
                        delta={kpis?.high_priority_count_pct_change}
                        caption={kpis?.high_priority_count_pct_change != null ? "vs yesterday" : "needs action"} />
              <StatCard icon={Zap}         label="Hot right now"   value={hotCount}                                        tintBg="bg-amber-50"  tintFg="text-amber-500"  caption="live signals" />
              <StatCard icon={PhoneCall}   label="Contacted today" value={data?.contacted_today ?? 0}                      tintBg="bg-emerald-50" tintFg="text-emerald-600" caption="today" />
              <StatCard icon={IndianRupee} label="In play"         value={formatRupee(kpis?.est_revenue_potential ?? 0)}   tintBg="bg-sky-50"    tintFg="text-sky-600"    caption="pipeline value" />
              <StatCard icon={Trophy}      label="Top 3 potential" value={formatRupee(kpis?.top_three_potential_revenue ?? 0)} tintBg="bg-violet-50" tintFg="text-violet-500" caption="your best 3" />
            </div>
          )}
        </section>

        {/* ── ALL LEADS TABLE ───────────────────────────────────────────── */}
        <section ref={tableRef} data-tour="queue.list" className="scroll-mt-4 rounded-2xl border border-slate-200/70 bg-white overflow-hidden">
          {/* Toolbar — one row (no stacking): search (left, fills) · grade tabs + refine controls (right) */}
          <div className="flex items-center gap-2.5 flex-wrap px-4 sm:px-5 py-3.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads, company…"
                className="h-9 w-full pl-9 pr-8 rounded-full bg-slate-50 border border-slate-200 text-[13px] text-slate-900
                           placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/25
                           focus:border-sky-400 focus:bg-white transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 z-10">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <span className="hidden lg:block h-6 w-px bg-slate-200 shrink-0 mx-1" aria-hidden />

            <span data-tour="queue.grades" className="block">
              <QueueGradeTabs active={gradeTab} onChange={setGradeTab} counts={counts} />
            </span>

            {isManager && teamData && teamData.members.length > 0 && (
              <ThemedSelect
                variant="pill"
                leadingIcon={<Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                value={repFilter ?? "all"}
                onValueChange={(v) => setRepFilter(v === "all" ? undefined : v)}
                options={[{ value: "all", label: "All reps" }, ...teamData.members.map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name ?? ""}`.trim() }))]}
                className="max-w-[150px]"
                aria-label="Filter by rep"
              />
            )}

            <ThemedSelect
              variant="pill"
              value={sourceFilter}
              onValueChange={setSourceFilter}
              options={[{ value: "all", label: "All sources" }, ...(sourcesData?.sources ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              className="max-w-[150px]"
              aria-label="Filter by source"
            />

            <div className="relative">
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-all",
                  filtersAreActive(filters)
                    ? "bg-sky-50 border-sky-200 text-sky-700"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
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
              <QueueFilters open={filtersOpen} onClose={() => setFiltersOpen(false)} state={filters} onChange={setFilters} />
            </div>
          </div>

          {/* Body: loading / empty / table */}
          {isLoading ? (
            <div className="px-4 sm:px-5 pb-5 flex flex-col gap-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : totalLeads === 0 ? (
            /* "All clear" read as "nothing to do today" to someone who had
               simply never imported, and it never said which workspace was
               empty. When the example leads exist, say where they are: the
               commonest reason this queue is bare is that the 24 samples are
               sitting one workspace away. */
            <EmptyState
              icon={search.trim() ? Search : Inbox}
              title={search.trim() ? `No results for “${search}”` : "No leads here yet"}
              description={search.trim()
                ? "Try a different name, company or number."
                : sampleWs
                  ? `${session?.workspace?.name ?? "This workspace"} starts empty, so this is where your own leads will land. The 24 example leads live in the Sample workspace.`
                  : "Import a batch and your queue fills up, sorted by who is worth calling first."}
              action={search.trim() ? (
                <button onClick={() => setSearch("")} className="text-[12px] text-sky-600 hover:text-sky-700 font-semibold">Clear search</button>
              ) : (
                <span className="flex flex-wrap items-center justify-center gap-3">
                  <a href="/leads/import" className="btn-primary inline-flex items-center gap-1.5 h-9 px-4 text-[12px]">
                    <Upload className="w-3.5 h-3.5" /> Import leads
                  </a>
                  {sampleWs && (
                    <button
                      type="button"
                      onClick={() => viewSample()}
                      className="text-[12px] font-semibold text-sky-600 transition-colors hover:text-sky-700"
                    >
                      View the example leads
                    </button>
                  )}
                </span>
              )}
              className="py-16"
            />
          ) : tabLeads.length === 0 ? (
            <div className="px-5 py-14 text-center text-[13px] text-ink-muted">No Grade {gradeTab} leads right now.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/50">
                      <Th className="pl-5">Lead</Th>
                      <Th className="hidden lg:table-cell">Signal</Th>
                      <Th className="text-right">Value</Th>
                      <Th>Grade</Th>
                      <Th className="hidden sm:table-cell">Next action</Th>
                      <Th className="hidden xl:table-cell">Source</Th>
                      <Th className="hidden lg:table-cell">Last active</Th>
                      <Th className="pr-5"><span className="sr-only">Open</span></Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageLeads.map((lead, i) => (
                      <QueueLeadRow
                        key={lead.id}
                        lead={lead}
                        onClick={setOpenLeadId}
                        isNext={gradeTab === "all" && safePage === 1 && i === 0}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer: count + pagination */}
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-5 py-3.5 border-t border-slate-100">
                <p className="text-[12.5px] text-ink-muted tabular-nums">
                  Showing {pageStart + 1}–{Math.min(pageStart + PER_PAGE, tabLeads.length)} of {tabLeads.length} lead{tabLeads.length === 1 ? "" : "s"}
                </p>
                {pageCount > 1 && (
                  <div className="flex items-center gap-1">
                    <PageBtn onClick={() => goToPage(safePage - 1)} disabled={safePage === 1} aria-label="Previous page">
                      <ChevronLeft className="w-4 h-4" />
                    </PageBtn>
                    {pageWindow(safePage, pageCount).map((p, idx) =>
                      p === "…" ? (
                        <span key={`ellipsis-${idx}`} className="w-8 text-center text-[13px] text-slate-400">…</span>
                      ) : (
                        <PageBtn key={p} active={p === safePage} onClick={() => goToPage(p)}>{p}</PageBtn>
                      ),
                    )}
                    <PageBtn onClick={() => goToPage(safePage + 1)} disabled={safePage === pageCount} aria-label="Next page">
                      <ChevronRight className="w-4 h-4" />
                    </PageBtn>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

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
