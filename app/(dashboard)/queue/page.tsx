"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useQueue } from "@/hooks/useQueue"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { QueueCard } from "@/components/queue/QueueCard"
import { QueueContextPanel } from "@/components/queue/QueueContextPanel"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle2, Users, Search, X, Flame, Target, ChevronDown } from "lucide-react"
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
  { grade: "C", label: "Grade C — Nurture",    defaultOpen: true,  dot: "bg-orange-400"  },
  { grade: "D", label: "Grade D",              defaultOpen: false, dot: "bg-amber-500"   },
  { grade: "E", label: "Grade E — Disqualify", defaultOpen: false, dot: "bg-rose-500"    },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

// ── Grade Section ─────────────────────────────────────────────────────────────

function GradeSection({
  label, leads, totalValue, defaultOpen, selectedId, onSelect, dot,
}: {
  grade: string
  label: string
  leads: QueueLead[]
  totalValue: number
  defaultOpen: boolean
  selectedId: string | null
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
        <div className="space-y-2.5">
          {leads.map((lead) => (
            <QueueCard key={lead.id} lead={lead} isSelected={selectedId === lead.id} onSelect={onSelect} />
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
  const [repFilter,  setRepFilter]  = useState<string | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search,     setSearch]     = useState("")

  const { data, isLoading, error } = useQueue(repFilter)
  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  fetchTeam,
    enabled:  isManager,
  })

  const summary        = data?.summary         ?? []
  const contactedToday = data?.contacted_today ?? 0
  const leads          = data?.leads           ?? []

  const filteredLeads = search.trim()
    ? leads.filter((l) => {
        const q = search.toLowerCase()
        return (
          `${l.first_name} ${l.last_name ?? ""}`.toLowerCase().includes(q) ||
          (l.company_name?.toLowerCase().includes(q) ?? false) ||
          (l.phone?.includes(q) ?? false)
        )
      })
    : leads

  const grouped = filteredLeads.reduce<Record<string, QueueLead[]>>((acc, l) => {
    if (!acc[l.grade]) acc[l.grade] = []
    acc[l.grade].push(l)
    return acc
  }, {})

  const totalLeads = filteredLeads.length
  const hotLeads   = [...(grouped["A"] ?? []), ...(grouped["B"] ?? [])]
  const hotCount   = hotLeads.length
  const hotValue   = hotLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0)
  const progressPct = hotCount > 0 ? Math.min(100, Math.round((contactedToday / hotCount) * 100)) : 0

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">

      {/* ── Left: queue list ──────────────────────────────────────────────── */}
      <div className="space-y-5 min-w-0">

        {/* Page heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white
                            bg-gradient-to-br from-sky-400 to-sky-600
                            shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-tight">Priority Queue</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">
                {isLoading
                  ? "Loading your queue…"
                  : totalLeads === 0
                    ? "No active leads — clear queue"
                    : repFilter && teamData
                      ? `${totalLeads} lead${totalLeads === 1 ? "" : "s"} · ${teamData.members.find((m) => m.id === repFilter)?.first_name ?? "Rep"}'s queue`
                      : `${totalLeads} active lead${totalLeads === 1 ? "" : "s"} · sorted by who matters most right now`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
          </div>
        </div>

        {/* Hero "At Stake Today" panel */}
        {!isLoading && hotCount > 0 && (
          <div className="relative overflow-hidden rounded-2xl glass-3 gloss-edge p-6">
            {/* Peach signature blob */}
            <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full pointer-events-none opacity-70"
                 style={{ background: "radial-gradient(closest-side, rgba(253,186,116,0.45), transparent 70%)" }} />
            {/* Sky aura blob */}
            <div className="absolute -left-16 -bottom-12 w-48 h-48 rounded-full pointer-events-none opacity-60"
                 style={{ background: "radial-gradient(closest-side, rgba(56,189,248,0.35), transparent 70%)" }} />

            <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-end">
              {/* Left: ₹ at stake */}
              <div>
                <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full
                                bg-orange-100/70 text-orange-700 border border-orange-200/60">
                  <Flame className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">At Stake Today</span>
                </div>
                <p className="text-[44px] font-bold tabular-nums leading-none tracking-tight text-slate-900">
                  {hotValue > 0
                    ? <>{formatValue(hotValue).replace("₹","")}<span className="text-slate-400 text-[28px] font-semibold ml-1">₹</span></>
                    : hotCount}
                </p>
                <p className="text-slate-500 text-[12px] font-medium mt-2">
                  {hotValue > 0
                    ? <><span className="font-semibold text-slate-700">{hotCount}</span> high-intent lead{hotCount > 1 ? "s" : ""} · response window open</>
                    : <>lead{hotCount > 1 ? "s" : ""} require contact today</>}
                </p>
              </div>

              {/* Right: contacted progress dial */}
              <div className="shrink-0 flex items-center gap-4">
                {progressPct === 100 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-white
                                    bg-gradient-to-br from-emerald-400 to-emerald-500
                                    shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_18px_rgba(16,185,129,0.32)]">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700">Done for today</span>
                  </div>
                ) : (
                  <>
                    <div className="text-right">
                      <div className="flex items-baseline gap-1 justify-end">
                        <span className="text-[36px] font-bold tabular-nums leading-none text-slate-900">{contactedToday}</span>
                        <span className="text-[18px] font-medium text-slate-400 tabular-nums">/ {hotCount}</span>
                      </div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1 font-semibold">contacted</p>
                    </div>
                    <ProgressDial pct={progressPct} />
                  </>
                )}
              </div>
            </div>

            {/* Bottom progress bar */}
            {progressPct < 100 && (
              <div className="relative mt-5 h-1.5 rounded-full bg-white/60 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-500 transition-all duration-700 ease-out"
                     style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>
        )}

        {/* Grade summary chips */}
        {!isLoading && summary.length > 0 && totalLeads > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {summary.filter((s) => s.count > 0).map((s) => {
              const dot = SECTIONS.find((sec) => sec.grade === s.grade)?.dot ?? "bg-slate-400"
              return (
                <div key={s.grade}
                  className="inline-flex items-center gap-2 rounded-full glass-1 border border-white/70 px-3 py-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className="text-[12px] font-bold tabular-nums text-slate-900">{s.count}</span>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">Grade {s.grade}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl glass-2 gloss-edge px-4 py-3 text-[13px] text-rose-700 border border-rose-200/60">
            <span className="font-semibold">Failed to load queue</span> — please refresh.
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-2.5">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[180px] w-full rounded-2xl" />)}
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

        {/* Grade sections */}
        {!isLoading && totalLeads > 0 && (
          <div className="space-y-6">
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
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  dot={section.dot} />
              )
            })}
          </div>
        )}

      </div>

      {/* ── Right: context panel ────────────────────────────────────────── */}
      {filteredLeads.length > 0 && (
        <div className="hidden xl:block sticky top-0">
          <QueueContextPanel leads={filteredLeads} selectedId={selectedId} />
        </div>
      )}
    </div>
  )
}

// ── Progress Dial ─────────────────────────────────────────────────────────────

function ProgressDial({ pct }: { pct: number }) {
  const r = 22, c = 2 * Math.PI * r
  const offset = c * (1 - pct / 100)
  return (
    <div className="relative w-14 h-14">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="url(#dial-grad)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={offset} />
        <defs>
          <linearGradient id="dial-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold tabular-nums text-slate-700">{pct}%</span>
      </div>
    </div>
  )
}
