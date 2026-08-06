"use client"

import { useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import Link from "next/link"
import {
  ArrowRight, Trophy, X, MoveRight, Clock, Settings2,
  KanbanSquare,
  Sparkles,
} from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { DeltaChip } from "@/components/shared/DeltaChip"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { startOfIstDay } from "@/lib/time/ist"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/useCurrentUser"

// ── Types ─────────────────────────────────────────────────────────────────────

interface NextAction { label: string; priority: number; reason: string; color: string }

interface PipelineLead {
  id:               string
  first_name:       string
  last_name:        string | null
  grade:            string
  expected_value:   number | null
  company_name:     string | null
  email:            string | null
  stage_id:         string
  stage_entered_at: string
  stage_reason:     string | null
  next_action:      NextAction | null
}

interface Stage {
  id: string; name: string; key: string; order: number
  is_terminal: boolean; is_won: boolean; is_lost: boolean
}

interface PipelineData {
  stages: Stage[]
  leads:  PipelineLead[]
}

interface KPI { value: number; delta_pct: number; spark: number[] }
interface ValuePoint { date: string; value: number }
interface SourceRow  { name: string; count: number; pct: number; color: string }
interface Activity   { id: string; label: string; lead_name: string; lead_id: string; ts: string; category: string }

interface SummaryData {
  kpis: { total: KPI; open: KPI; won: KPI; lost: KPI; win_rate: KPI }
  value_trend: ValuePoint[]
  total_value: number
  sources:     SourceRow[]
  activities:  Activity[]
  window:      { this_month_label: string; last_month_label: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

function daysInStage(enteredAt: string): number {
  // Count IST calendar days crossed, so "Today" means entered today in IST
  // (not a rolling 24h window that flips at UTC midnight).
  const a = startOfIstDay(new Date(enteredAt)).getTime()
  const b = startOfIstDay(new Date()).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function stuckThreshold(stageKey: string): number {
  if (stageKey === "new_inquiry")   return 1
  if (stageKey === "contacted")     return 3
  if (stageKey === "proposal_sent") return 5
  return 7
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPipeline(): Promise<PipelineData> {
  const [stagesRes, firstRes] = await Promise.all([
    fetch("/api/pipeline/stages", { credentials: "include" }),
    fetch("/api/leads?page=1", { credentials: "include" }),
  ])
  const stages = stagesRes.ok ? await stagesRes.json() : { stages: [] }
  const first  = firstRes.ok  ? await firstRes.json()  : { leads: [], pages: 1 }
  let leads = first.leads ?? []

  // The board must show every active lead, not just the first page (was capped
  // at 100 → columns and Won/Lost totals were silently wrong). Pull the
  // remaining pages in parallel, capped so a very large account can't fire
  // hundreds of requests (a board that big is unusable anyway).
  const totalPages = Math.min(first.pages ?? 1, 30)
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetch(`/api/leads?page=${i + 2}`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : { leads: [] }))
          .then((j) => j.leads ?? [])
          .catch(() => []),
      ),
    )
    leads = leads.concat(...rest)
  }

  return {
    stages: (stages.stages ?? []).sort((a: Stage, b: Stage) => a.order - b.order),
    leads,
  }
}

async function fetchSummary(): Promise<SummaryData> {
  const res = await fetch("/api/pipeline/summary", { credentials: "include" })
  if (!res.ok) throw new Error("Failed to load summary")
  return res.json()
}

// ── Stage / grade visual maps ─────────────────────────────────────────────────

const STAGE_PALETTE: Record<string, { dot: string; ring: string; track: string }> = {
  new_inquiry:    { dot: "bg-violet-500",  ring: "ring-violet-200/60",  track: "from-violet-400 to-violet-500" },
  contacted:      { dot: "bg-sky-500",     ring: "ring-sky-200/60",     track: "from-sky-400 to-sky-500" },
  qualified:      { dot: "bg-cyan-500",    ring: "ring-cyan-200/60",    track: "from-cyan-400 to-cyan-500" },
  proposal_sent:  { dot: "bg-teal-500",    ring: "ring-teal-200/60",    track: "from-teal-400 to-teal-500" },
  negotiation:    { dot: "bg-orange-500",  ring: "ring-orange-200/60",  track: "from-orange-400 to-orange-500" },
  follow_up:      { dot: "bg-amber-500",   ring: "ring-amber-200/60",   track: "from-amber-400 to-amber-500" },
  won:            { dot: "bg-emerald-500", ring: "ring-emerald-200/60", track: "from-emerald-400 to-emerald-500" },
  lost:           { dot: "bg-rose-500",    ring: "ring-rose-200/60",    track: "from-rose-400 to-rose-500" },
}
const STAGE_FALLBACK = { dot: "bg-slate-500", ring: "ring-slate-200/60", track: "from-slate-400 to-slate-500" }

// ── Page ──────────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all",  label: "All"    },
  { key: "hot",  label: "Hot A+B"},
  { key: "A",    label: "A"      },
  { key: "B",    label: "B"      },
]

export default function PipelinePage() {
  const queryClient = useQueryClient()
  const { data: session } = useCurrentUser()
  const isAdmin = session?.user.role === "ADMIN"

  const { data, isLoading } = useQuery<PipelineData>({
    queryKey: ["pipeline"],
    queryFn:  fetchPipeline,
    staleTime: 30_000,
  })
  const { data: summary } = useQuery<SummaryData>({
    queryKey: ["pipeline-summary"],
    queryFn:  fetchSummary,
    staleTime: 60_000,
  })

  const [gradeFilter,  setGradeFilter]  = useState("all")
  const [wonLeadId,    setWonLeadId]    = useState<string | null>(null)
  const [lostLeadId,   setLostLeadId]   = useState<string | null>(null)
  const [moveLeadId,   setMoveLeadId]   = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)
  const [peekLeadId,   setPeekLeadId]   = useState<string | null>(null)

  const stages = useMemo(() => data?.stages ?? [], [data?.stages])
  const allLeads = useMemo(() => data?.leads ?? [], [data?.leads])
  const activeStages = useMemo(() => stages.filter((s) => !s.is_terminal), [stages])
  const wonStage  = useMemo(() => stages.find((s) => s.is_won), [stages])
  const lostStage = useMemo(() => stages.find((s) => s.is_lost), [stages])

  const leads = useMemo(() => {
    if (gradeFilter === "all") return allLeads
    if (gradeFilter === "hot") return allLeads.filter((l) => l.grade === "A" || l.grade === "B")
    return allLeads.filter((l) => l.grade === gradeFilter)
  }, [allLeads, gradeFilter])

  const wonLeadsAll  = wonStage  ? allLeads.filter((l) => l.stage_id === wonStage.id)  : []
  const lostLeadsAll = lostStage ? allLeads.filter((l) => l.stage_id === lostStage.id) : []

  // Build column groups including won (so the kanban shows the won column like the reference)
  const columns = useMemo(() => {
    const cols = activeStages.map((s) => s)
    if (wonStage) cols.push(wonStage)
    return cols
  }, [activeStages, wonStage])

  const byStage = columns.reduce<Record<string, PipelineLead[]>>((acc, stage) => {
    const pool = stage.is_won ? wonLeadsAll : leads
    acc[stage.id] = pool.filter((l) => l.stage_id === stage.id)
    return acc
  }, {})


  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["pipeline"] })
    queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] })
  }

  // Drag-and-drop: move a card to another (non-terminal) stage. Optimistically
  // moves the card, then POSTs the stage change. Backward moves send a default
  // note (the API requires one). Won/Lost go through their own modals, so
  // terminal columns are not drop targets.
  async function handleCardDrop(leadId: string, fromStageId: string, toStage: Stage) {
    setDragOverStageId(null)
    if (!leadId || toStage.id === fromStageId || toStage.is_terminal) return
    const fromStage  = stages.find((s) => s.id === fromStageId)
    const isBackward = fromStage ? toStage.order < fromStage.order : false

    queryClient.setQueryData<PipelineData>(["pipeline"], (prev) =>
      prev
        ? { ...prev, leads: prev.leads.map((l) => l.id === leadId
            ? { ...l, stage_id: toStage.id, stage_entered_at: new Date().toISOString() }
            : l) }
        : prev,
    )

    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({ stage_id: toStage.id, note: isBackward ? `Moved back to "${toStage.name}" on the pipeline board` : null }),
      })
      if (res.ok) toast.success(`Moved to ${toStage.name}`)
      else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Couldn't move the deal") }
    } catch {
      toast.error("Couldn't move the deal — check your connection")
    } finally {
      // Always reconcile with the server truth, so a failed move reverts the
      // optimistic card position instead of leaving it in the wrong column.
      invalidate()
    }
  }

  if (isLoading) return (
    <div className="space-y-5">
      <Skeleton className="h-12 w-64 rounded-xl" />
      <div className="grid grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      <div className="flex gap-3 overflow-x-auto pb-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-72 w-[260px] shrink-0 rounded-2xl" />)}</div>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl grid place-items-center bg-sky-50 text-sky-600 shrink-0">
            <KanbanSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[24px] font-semibold text-ink tracking-[-0.02em] leading-tight">Pipeline</h1>
            <p className="text-[13px] text-ink-muted mt-1">
              Auto-stage tracker for every deal in motion — moves when calls and WhatsApp signals land
            </p>
          </div>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          {/* Grade filter chips */}
          <div className="flex items-center gap-1 p-1 rounded-full border border-slate-200 bg-white">
            {FILTERS.map((f) => {
              const active = gradeFilter === f.key
              return (
                <button key={f.key} onClick={() => setGradeFilter(f.key)}
                  className={`px-3 h-7 rounded-full text-[12px] font-semibold transition-all ${
                    active
                      ? "text-white bg-sky-600"
                      : "text-ink-muted hover:text-ink"
                  }`}>
                  {f.label}
                </button>
              )
            })}
          </div>
          <Link href="/leads/import"
            className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-white
                       bg-sky-600 hover:bg-sky-700 transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
            Add leads
          </Link>
        </div>
      </div>

      {/* ── 5 KPI tiles ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Deals"  value={summary?.kpis.total.value ?? 0}    delta={summary?.kpis.total.delta_pct}    spark={summary?.kpis.total.spark}    accent="sky" lastLabel={summary?.window.last_month_label} />
        <KpiCard label="Open Deals"   value={summary?.kpis.open.value ?? 0}     delta={summary?.kpis.open.delta_pct}     spark={summary?.kpis.open.spark}     accent="violet" lastLabel={summary?.window.last_month_label} />
        <KpiCard label="Won Deals"    value={summary?.kpis.won.value ?? 0}      delta={summary?.kpis.won.delta_pct}      spark={summary?.kpis.won.spark}      accent="mint" lastLabel={summary?.window.last_month_label} />
        <KpiCard label="Lost Deals"   value={summary?.kpis.lost.value ?? 0}     delta={summary?.kpis.lost.delta_pct}     spark={summary?.kpis.lost.spark}     accent="peach" lastLabel={summary?.window.last_month_label} invertDelta />
        <KpiCard label="Win Rate"     value={summary?.kpis.win_rate.value ?? 0} delta={summary?.kpis.win_rate.delta_pct} spark={summary?.kpis.win_rate.spark} accent="sky" lastLabel={summary?.window.last_month_label} suffix="%" />
      </div>

      {/* ── Kanban board ───────────────────────────────────────────────── */}
      <div className="relative">
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
          {columns.map((stage) => {
            const stageLeads = byStage[stage.id] ?? []
            const stageValue = stageLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0)
            const palette    = STAGE_PALETTE[stage.key] ?? STAGE_FALLBACK

            const sorted = [...stageLeads].sort((a, b) => {
              const order = "ABCDEF"
              const gd = order.indexOf(a.grade) - order.indexOf(b.grade)
              if (gd !== 0) return gd
              return (b.expected_value ?? 0) - (a.expected_value ?? 0)
            })

            const droppable = !stage.is_terminal
            return (
              <div
                key={stage.id}
                onDragOver={droppable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverStageId(stage.id) } : undefined}
                onDragLeave={droppable ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStageId(null) } : undefined}
                onDrop={droppable ? (e) => { e.preventDefault(); handleCardDrop(e.dataTransfer.getData("text/lead-id"), e.dataTransfer.getData("text/from-stage"), stage) } : undefined}
                className={`w-[270px] shrink-0 flex flex-col rounded-2xl border border-slate-200/70 bg-white p-3 max-h-[640px] transition-all ${dragOverStageId === stage.id ? "ring-2 ring-sky-400 bg-sky-50" : ""}`}>

                {/* Column header */}
                <div className="px-1 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${palette.dot}`} />
                      <p className="text-[13px] font-bold text-ink leading-none truncate">{stage.name}</p>
                      <span className="text-[11px] font-bold text-ink-muted tabular-nums shrink-0">{stageLeads.length}</span>
                    </div>
                    {stageValue > 0 && (
                      <p className="text-[11px] font-bold text-ink-soft tabular-nums shrink-0">{formatValue(stageValue)}</p>
                    )}
                  </div>
                  <div className={`h-1 rounded-full bg-gradient-to-r ${palette.track} opacity-70 mt-2.5`} />
                </div>

                {/* Lead cards */}
                <div className="flex flex-col gap-2 overflow-y-auto pr-1 -mr-1 flex-1
                                [&::-webkit-scrollbar]:w-1.5
                                [&::-webkit-scrollbar-thumb]:bg-slate-200
                                [&::-webkit-scrollbar-thumb]:rounded-full">
                  {sorted.map((lead) => (
                    <PipelineLeadCard
                      key={lead.id}
                      lead={lead}
                      stageKey={stage.key}
                      stages={activeStages}
                      currentStage={stage}
                      isWonColumn={stage.is_won}
                      onPeek={() => setPeekLeadId(lead.id)}
                      onWon={() => setWonLeadId(lead.id)}
                      onLost={() => setLostLeadId(lead.id)}
                      onMove={() => setMoveLeadId(lead.id)}
                      onMoved={invalidate}
                    />
                  ))}
                  {sorted.length === 0 && (
                    <div className={`rounded-xl border border-dashed h-16 flex items-center justify-center transition-colors ${
                      dragOverStageId === stage.id
                        ? "border-sky-300 bg-sky-50"
                        : "border-slate-200 bg-white"
                    }`}>
                      <p className={`text-[11px] font-medium ${dragOverStageId === stage.id ? "text-sky-600" : "text-ink-muted"}`}>
                        {dragOverStageId === stage.id ? "Drop to move here" : droppable ? "Drag a deal here" : "No deals here yet"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {columns.length === 0 && (
            <div className="rounded-2xl border border-slate-200/70 bg-white px-8 py-16 text-center w-full">
              <div className="w-12 h-12 rounded-lg grid place-items-center bg-sky-50 text-sky-600 mx-auto mb-4">
                <Settings2 className="w-6 h-6" />
              </div>
              <p className="text-[16px] font-semibold text-ink">No pipeline stages configured</p>
              <p className="text-[12px] text-ink-muted mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                {isAdmin
                  ? "Set up your stages in ICP Settings to start tracking deals."
                  : "Ask your account admin to configure pipeline stages."}
              </p>
              {isAdmin && (
                <Link href="/settings/icp"
                  className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-lg
                             text-white bg-sky-600 hover:bg-sky-700
                             text-[12px] font-semibold transition-colors">
                  <Settings2 className="w-3 h-3" />
                  Configure stages
                </Link>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Full lead detail — opens for any card click */}
      {peekLeadId && (
        <LeadSlideOver leadId={peekLeadId} onClose={() => setPeekLeadId(null)} />
      )}

      {/* Lost / hidden won column summary at very bottom for context */}
      {lostLeadsAll.length > 0 && (
        <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 flex items-center gap-3 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span className="font-semibold text-ink-soft">Lost this account: <span className="tabular-nums">{lostLeadsAll.length}</span></span>
          <span className="text-ink-muted">·</span>
          <span className="text-ink-muted">Audit reasons in Analytics → Why You&apos;re Losing</span>
          <Link href="/analytics" className="ml-auto text-sky-600 hover:text-sky-700 font-semibold">View →</Link>
        </div>
      )}

      {/* Modals */}
      {wonLeadId && <WonModal leadId={wonLeadId} onClose={() => setWonLeadId(null)} onSuccess={() => { setWonLeadId(null); invalidate() }} />}
      {lostLeadId && <LostModal leadId={lostLeadId} onClose={() => setLostLeadId(null)} onSuccess={() => { setLostLeadId(null); invalidate() }} />}
      {moveLeadId && (
        <MoveStageModal
          leadId={moveLeadId}
          stages={activeStages}
          currentStageId={allLeads.find((l) => l.id === moveLeadId)?.stage_id ?? ""}
          onClose={() => setMoveLeadId(null)}
          onSuccess={() => { setMoveLeadId(null); invalidate() }}
        />
      )}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, delta, spark, accent, lastLabel, suffix, invertDelta = false,
}: {
  label: string; value: number; delta?: number; spark?: number[]
  accent: "sky" | "violet" | "mint" | "peach"
  lastLabel?: string; suffix?: string; invertDelta?: boolean
}) {
  const ACCENT = {
    sky:    { stroke: "#0EA5E9", fill: "rgba(14,165,233,0.14)",  dot: "bg-sky-500"     },
    violet: { stroke: "#8B5CF6", fill: "rgba(139,92,246,0.14)",  dot: "bg-violet-500"  },
    mint:   { stroke: "#10B981", fill: "rgba(16,185,129,0.14)",  dot: "bg-emerald-500" },
    peach:  { stroke: "#FB923C", fill: "rgba(251,146,60,0.16)",  dot: "bg-orange-400"  },
  }
  const a = ACCENT[accent]

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 flex flex-col gap-3 min-h-[132px]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
          <p className="text-[12px] font-semibold text-ink-soft">{label}</p>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-[30px] font-bold text-ink tabular-nums leading-none">
          {value.toLocaleString("en-IN")}{suffix ?? ""}
        </p>
        <DeltaChip delta={delta} invert={invertDelta} className="mb-0.5" />
      </div>
      <p className="text-[10px] text-ink-muted -mt-1">vs {lastLabel ?? "last month"}</p>
      {spark && spark.length >= 2 && <Sparkline points={spark} stroke={a.stroke} fill={a.fill} />}
    </div>
  )
}

function Sparkline({ points, stroke, fill }: { points: number[]; stroke: string; fill: string }) {
  const W = 100, H = 28
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map((p) => H - ((p - min) / range) * (H - 4) - 2)
  const path  = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")
  const area  = `${path} L${W},${H} L0,${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-7 mt-auto">
      <path d={area} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────

function PipelineLeadCard({
  lead, stageKey, stages, currentStage, isWonColumn,
  onPeek, onWon, onLost, onMove, onMoved,
}: {
  lead: PipelineLead; stageKey: string; stages: Stage[]; currentStage: Stage; isWonColumn: boolean
  onPeek: () => void; onWon: () => void; onLost: () => void; onMove: () => void; onMoved: () => void
}) {
  const [movingForward, setMovingForward] = useState(false)
  const [dragging, setDragging] = useState(false)
  const days      = daysInStage(lead.stage_entered_at)
  const threshold = stuckThreshold(stageKey)
  const isStuck   = days >= threshold && !isWonColumn
  const isHot     = lead.grade === "A" || lead.grade === "B"
  const nextStage = stages.find((s) => s.order === currentStage.order + 1)

  async function moveForward() {
    if (!nextStage) return
    setMovingForward(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/stage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({ stage_id: nextStage.id }),
      })
      if (res.ok) { toast.success(`Moved to ${nextStage.name}`); onMoved() }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Failed to move stage") }
    } catch {
      toast.error("Failed to move stage — check your connection")
    } finally {
      setMovingForward(false)
    }
  }

  return (
    <div
      onClick={onPeek}
      draggable={!isWonColumn}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead-id", lead.id)
        e.dataTransfer.setData("text/from-stage", lead.stage_id)
        e.dataTransfer.effectAllowed = "move"
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      className={`group rounded-xl border border-slate-200/70 bg-white px-3 py-2.5
                  ${isWonColumn ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}
                  transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-300
                  ${dragging ? "opacity-40" : ""}
                  ${isHot ? "ring-1 ring-sky-200/60" : ""}`}>

      {/* Top: name + value */}
      <div className="flex items-start gap-2">
        <GradeBadge grade={lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink truncate leading-tight">
            {lead.first_name} {lead.last_name ?? ""}
          </p>
          <p className="text-[11px] text-ink-muted truncate leading-tight mt-0.5">
            {lead.email ?? lead.company_name ?? "—"}
          </p>
        </div>
        {isWonColumn ? (
          <span className="text-[10px] font-bold text-emerald-700 px-1.5 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-200/60 shrink-0">
            Won
          </span>
        ) : lead.expected_value ? (
          <span className="text-[12px] font-bold text-ink tabular-nums shrink-0">
            {formatValue(lead.expected_value)}
          </span>
        ) : null}
      </div>

      {/* Meta row — time in stage + next action (Hot is already shown by the
          A/B grade badge + the sky ring, so no separate pill). */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
          !isStuck
            ? "bg-white text-ink-muted border border-slate-200"
            : days >= 30
              ? "bg-rose-100 text-rose-700 border border-rose-200/60"
              : "bg-amber-100 text-amber-700 border border-amber-200/60"
        }`}>
          <Clock className="w-2.5 h-2.5" />
          {days === 0 ? "Today" : `${days}d`}
          {isStuck && (days >= 30 ? " · stuck" : " · slowing")}
        </span>
        {lead.next_action && !isWonColumn && (
          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${lead.next_action.color}`}>
            {lead.next_action.label}
          </span>
        )}
      </div>

      {/* Hover-revealed action row (kept compact so it doesn't crowd default state) */}
      {!isWonColumn && (
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
             onClick={(e) => e.stopPropagation()}>
          <button onClick={onWon}
            className="flex items-center gap-1 text-[10px] font-bold text-emerald-700
                       border border-emerald-200/70 rounded-full px-1.5 py-0.5
                       hover:bg-emerald-50 transition-colors">
            <Trophy className="w-2.5 h-2.5" /> Won
          </button>
          <button onClick={onLost}
            className="flex items-center gap-1 text-[10px] font-bold text-rose-600
                       border border-rose-200/70 rounded-full px-1.5 py-0.5
                       hover:bg-rose-50 transition-colors">
            <X className="w-2.5 h-2.5" /> Lost
          </button>
          <div className="flex-1" />
          {nextStage && (
            <button onClick={moveForward} disabled={movingForward}
              title={`Move to ${nextStage.name}`}
              className="flex items-center gap-1 text-[10px] font-bold text-sky-600
                         border border-sky-200/70 rounded-full px-1.5 py-0.5
                         hover:bg-sky-50 transition-colors disabled:opacity-50">
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}
          <button onClick={onMove} title="Move to any stage"
            className="w-5 h-5 rounded-full text-ink-muted hover:text-ink hover:bg-slate-100 transition-all flex items-center justify-center">
            <MoveRight className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Move Stage Modal ──────────────────────────────────────────────────────────

function MoveStageModal({ leadId, stages, currentStageId, onClose, onSuccess }: {
  leadId: string; stages: Stage[]; currentStageId: string
  onClose: () => void; onSuccess: () => void
}) {
  const [selectedStageId, setSelectedStageId] = useState("")
  const [note,            setNote]            = useState("")
  const [saving,          setSaving]          = useState(false)

  const currentStage = stages.find((s) => s.id === currentStageId)
  const isBackward = selectedStageId
    ? (stages.find((s) => s.id === selectedStageId)?.order ?? 0) < (currentStage?.order ?? 0)
    : false

  async function submit() {
    if (!selectedStageId) { toast.error("Select a stage"); return }
    if (isBackward && !note.trim()) { toast.error("A reason is required for moving back"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/stage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body:    JSON.stringify({ stage_id: selectedStageId, note: note || null }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Stage updated"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  const otherStages = stages.filter((s) => s.id !== currentStageId)

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Move Stage</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-ink-muted hover:text-ink hover:bg-slate-100 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentStage && (
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <span className="px-2 py-0.5 rounded-full bg-white text-ink-soft font-medium border border-slate-200">{currentStage.name}</span>
            <ArrowRight className="w-3.5 h-3.5 text-ink-muted" />
            <span className="text-ink-muted">select below</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Move to</label>
          <div className="grid grid-cols-2 gap-2">
            {otherStages.map((s) => {
              const isBack = (s.order < (currentStage?.order ?? 0))
              const active = selectedStageId === s.id
              return (
                <button key={s.id} onClick={() => setSelectedStageId(s.id)}
                  className={`px-3 py-2 rounded-lg text-[12px] font-semibold border transition-all duration-150 text-left ${
                    active
                      ? "bg-sky-600 text-white border-sky-600"
                      : isBack
                        ? "bg-white text-ink-muted border-slate-200 hover:border-slate-300"
                        : "bg-white text-ink-soft border-slate-200 hover:border-sky-300 hover:text-sky-700"
                  }`}>
                  {isBack && <span className="text-[10px] mr-1 opacity-60">↩</span>}
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>

        {isBackward && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
              Reason for moving back <span className="text-rose-500">*</span>
            </label>
            <textarea rows={2}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-[13px] bg-white
                         focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
              placeholder="e.g. Customer went quiet, re-qualifying…"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-slate-200 text-[13px] font-semibold
                       text-ink-soft hover:bg-slate-50 transition-all duration-150 bg-white">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !selectedStageId}
            className="flex-1 h-10 rounded-lg text-white text-[13px] font-semibold transition-colors
                       bg-sky-600 hover:bg-sky-700 disabled:opacity-50">
            {saving ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Won Modal ─────────────────────────────────────────────────────────────────

function WonModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess: () => void }) {
  const [value,  setValue]  = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!value || parseInt(value) <= 0) { toast.error("Deal value is required"); return }
    if (!reason) { toast.error("Win reason is required"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/won`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ won_value: parseInt(value), win_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Marked as Won!"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Mark as Won</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-ink-muted hover:text-ink hover:bg-slate-100 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
            Deal Value (₹) <span className="text-rose-500">*</span>
          </label>
          <input type="number"
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-[14px] bg-white
                       focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="e.g. 50000" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
            Win Reason <span className="text-rose-500">*</span>
          </label>
          <ThemedSelect
            value={reason} onValueChange={setReason}
            options={["COMPETITIVE_PRICE","BEST_FIT","REFERRAL_TRUST","FAST_DELIVERY","EXISTING_RELATIONSHIP","OTHER"]
              .map(r => ({ value: r, label: r.replace(/_/g," ") }))}
            placeholder="Select reason…" aria-label="Win reason"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-slate-200 text-[13px] font-semibold
                       text-ink-soft hover:bg-slate-50 transition-all duration-150 bg-white">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-10 rounded-lg text-white text-[13px] font-semibold transition-colors
                       bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Saving…" : "Mark Won"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Lost Modal ────────────────────────────────────────────────────────────────

function LostModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!reason) { toast.error("Loss reason is required"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/lost`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ loss_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Marked as Lost"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Mark as Lost</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-ink-muted hover:text-ink hover:bg-slate-100 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
            Loss Reason <span className="text-rose-500">*</span>
          </label>
          <ThemedSelect
            value={reason} onValueChange={setReason}
            options={["PRICE_TOO_HIGH","WENT_COMPETITOR","NO_BUDGET","NO_RESPONSE","REQUIREMENT_CHANGED","WRONG_FIT","OTHER"]
              .map(r => ({ value: r, label: r.replace(/_/g," ") }))}
            placeholder="Select reason…" aria-label="Loss reason"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-slate-200 text-[13px] font-semibold
                       text-ink-soft hover:bg-slate-50 transition-all duration-150 bg-white">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-10 rounded-lg text-white text-[13px] font-semibold transition-colors
                       bg-rose-600 hover:bg-rose-700 disabled:opacity-50">
            {saving ? "Saving…" : "Mark Lost"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
