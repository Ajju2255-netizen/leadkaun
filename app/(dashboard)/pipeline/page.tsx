"use client"

import { useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import Link from "next/link"
import {
  ArrowRight, Trophy, X, MoveRight, Clock, Flame, Settings2,
  KanbanSquare, MoreHorizontal,
  Phone, MessageSquare, Mail, Sparkles, Activity,
} from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { DeltaChip } from "@/components/shared/DeltaChip"
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
  return Math.floor((Date.now() - new Date(enteredAt).getTime()) / 86_400_000)
}

function stuckThreshold(stageKey: string): number {
  if (stageKey === "new_inquiry")   return 1
  if (stageKey === "contacted")     return 3
  if (stageKey === "proposal_sent") return 5
  return 7
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPipeline(): Promise<PipelineData> {
  const [stagesRes, leadsRes] = await Promise.all([
    fetch("/api/pipeline/stages", { credentials: "include" }),
    fetch("/api/leads?page=1", { credentials: "include" }),
  ])
  const stages = stagesRes.ok ? await stagesRes.json() : { stages: [] }
  const leads  = leadsRes.ok  ? await leadsRes.json()  : { leads:  [] }
  return {
    stages: (stages.stages ?? []).sort((a: Stage, b: Stage) => a.order - b.order),
    leads:  leads.leads ?? [],
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

const SOURCE_COLOR: Record<string, string> = {
  sky:    "bg-sky-500",
  violet: "bg-violet-500",
  mint:   "bg-emerald-500",
  peach:  "bg-orange-400",
  amber:  "bg-amber-500",
  ink:    "bg-slate-400",
}

const ACTIVITY_ICON: Record<string, { icon: typeof Phone; color: string }> = {
  call:     { icon: Phone,         color: "from-sky-400 to-sky-600" },
  whatsapp: { icon: MessageSquare, color: "from-emerald-400 to-emerald-600" },
  email:    { icon: Mail,          color: "from-violet-400 to-violet-600" },
  import:   { icon: Sparkles,      color: "from-orange-400 to-orange-500" },
  system:   { icon: Activity,      color: "from-slate-400 to-slate-500" },
}

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

  const peekLead = peekLeadId ? allLeads.find((l) => l.id === peekLeadId) ?? null : null

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

    const res = await fetch(`/api/leads/${leadId}/stage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body:    JSON.stringify({ stage_id: toStage.id, note: isBackward ? `Moved back to "${toStage.name}" on the pipeline board` : null }),
    })
    if (res.ok) toast.success(`Moved to ${toStage.name}`)
    else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Couldn't move the deal") }
    invalidate()
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
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white
                          bg-gradient-to-br from-sky-400 to-sky-600
                          shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
            <KanbanSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-tight">Pipeline</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Auto-stage tracker for every deal in motion — moves when calls and WhatsApp signals land
            </p>
          </div>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          {/* Grade filter chips */}
          <div className="flex items-center gap-1 p-1 rounded-full glass-1 border border-white/70 shadow-sm">
            {FILTERS.map((f) => {
              const active = gradeFilter === f.key
              return (
                <button key={f.key} onClick={() => setGradeFilter(f.key)}
                  className={`px-3 h-7 rounded-full text-[12px] font-semibold transition-all ${
                    active
                      ? "text-white bg-gradient-to-b from-sky-400 to-sky-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_6px_rgba(14,165,233,0.32)]"
                      : "text-slate-600 hover:text-slate-900"
                  }`}>
                  {f.label}
                </button>
              )
            })}
          </div>
          <Link href="/leads/import"
            className="h-9 px-4 inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold text-white
                       bg-gradient-to-b from-sky-400 to-sky-500
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                       hover:from-sky-500 hover:to-sky-600 transition-all active:scale-[0.98]">
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
                className={`w-[270px] shrink-0 flex flex-col rounded-2xl glass-2 gloss-edge p-3 max-h-[640px] transition-all ${dragOverStageId === stage.id ? "ring-2 ring-sky-400 bg-sky-50/50" : ""}`}>

                {/* Column header */}
                <div className="flex items-center justify-between px-1 pt-0.5 pb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${palette.dot}`} />
                    <p className="text-[13px] font-bold text-slate-900 leading-none truncate">{stage.name}</p>
                  </div>
                  <button className="w-6 h-6 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/70 flex items-center justify-center transition-colors">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between px-1 pb-2">
                  <p className="text-[11px] text-slate-500 font-mono">
                    <span className="font-bold text-slate-700 tabular-nums">{stageLeads.length}</span> Deals
                  </p>
                  {stageValue > 0 && (
                    <p className="text-[11px] font-bold text-slate-600 tabular-nums">{formatValue(stageValue)}</p>
                  )}
                </div>
                <div className={`h-1 rounded-full bg-gradient-to-r ${palette.track} opacity-70 mb-3`} />

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
                    <div className="rounded-xl border border-dashed border-slate-200/80 bg-white/40
                                    h-16 flex items-center justify-center">
                      <p className="text-[11px] font-medium text-slate-400">No deals here yet</p>
                    </div>
                  )}
                </div>

                <button className="mt-2 h-8 rounded-xl text-[12px] font-semibold text-sky-600
                                   hover:bg-white/70 hover:text-sky-700 transition-colors
                                   flex items-center justify-center gap-1">
                  <span className="text-[14px] font-bold leading-none">+</span> Add Lead
                </button>
              </div>
            )
          })}

          {columns.length === 0 && (
            <div className="rounded-2xl glass-2 gloss-edge px-8 py-16 text-center w-full">
              <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
                <Settings2 className="w-6 h-6 text-sky-500" />
              </div>
              <p className="text-[15px] font-semibold text-slate-900">No pipeline stages configured</p>
              <p className="text-[12px] text-slate-500 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                {isAdmin
                  ? "Set up your stages in ICP Settings to start tracking deals."
                  : "Ask your account admin to configure pipeline stages."}
              </p>
              {isAdmin && (
                <Link href="/settings/icp"
                  className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-full
                             text-white bg-gradient-to-b from-sky-400 to-sky-500
                             shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                             text-[12px] font-semibold transition-all active:scale-[0.98]">
                  <Settings2 className="w-3 h-3" />
                  Configure stages
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Floating lead peek overlay (right-anchored over the board) */}
        {peekLead && (
          <LeadPeekCard lead={peekLead} stages={stages} onClose={() => setPeekLeadId(null)} />
        )}
      </div>

      {/* ── Bottom analytics row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5">
          <ValueTrendChart trend={summary?.value_trend ?? []} totalValue={summary?.total_value ?? 0} />
        </div>
        <div className="lg:col-span-4">
          <SourceDonut sources={summary?.sources ?? []} totalLeads={summary?.kpis.total.value ?? 0} />
        </div>
        <div className="lg:col-span-3">
          <ActivityFeed activities={summary?.activities ?? []} />
        </div>
      </div>

      {/* Lost / hidden won column summary at very bottom for context */}
      {lostLeadsAll.length > 0 && (
        <div className="rounded-2xl glass-1 px-4 py-3 flex items-center gap-3 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span className="font-semibold text-slate-700">Lost this account: <span className="tabular-nums">{lostLeadsAll.length}</span></span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">Audit reasons in Analytics → Why You&apos;re Losing</span>
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
    <div className="rounded-2xl glass-3 gloss-edge p-4 flex flex-col gap-3 min-h-[132px] transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
          <p className="text-[12px] font-semibold text-slate-500">{label}</p>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-[28px] font-bold text-slate-900 tabular-nums leading-none">
          {value.toLocaleString("en-IN")}{suffix ?? ""}
        </p>
        <DeltaChip delta={delta} invert={invertDelta} className="mb-0.5" />
      </div>
      <p className="text-[10px] text-slate-400 -mt-1">vs {lastLabel ?? "last month"}</p>
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
    const res = await fetch(`/api/leads/${lead.id}/stage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body:    JSON.stringify({ stage_id: nextStage.id }),
    })
    setMovingForward(false)
    if (res.ok) { toast.success(`Moved to ${nextStage.name}`); onMoved() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed to move stage") }
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
      className={`group rounded-xl glass-1 px-3 py-2.5
                  ${isWonColumn ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}
                  transition-all duration-200 hover:-translate-y-[1px]
                  hover:shadow-[0_8px_22px_rgba(15,23,42,0.08)]
                  ${dragging ? "opacity-40" : ""}
                  ${isHot ? "ring-1 ring-sky-200/60" : ""}`}>

      {/* Top: name + value */}
      <div className="flex items-start gap-2">
        <GradeBadge grade={lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-900 truncate leading-tight">
            {lead.first_name} {lead.last_name ?? ""}
          </p>
          <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
            {lead.email ?? lead.company_name ?? "—"}
          </p>
        </div>
        {isWonColumn ? (
          <span className="text-[10px] font-bold text-emerald-700 px-1.5 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-200/60 shrink-0">
            Won
          </span>
        ) : lead.expected_value ? (
          <span className="text-[12px] font-bold text-slate-900 tabular-nums shrink-0">
            {formatValue(lead.expected_value)}
          </span>
        ) : null}
      </div>

      {/* Pills row */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
          isStuck
            ? "bg-rose-100 text-rose-700 border border-rose-200/60"
            : "bg-white/70 text-slate-500 border border-slate-200/60"
        }`}>
          <Clock className="w-2.5 h-2.5" />
          {days === 0 ? "Today" : `${days}d`}
          {isStuck && " · stuck"}
        </span>
        {isHot && !isWonColumn && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                           bg-orange-100 text-orange-700 border border-orange-200/60">
            <Flame className="w-2.5 h-2.5" /> Hot
          </span>
        )}
        {lead.next_action && (
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
            className="w-5 h-5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all flex items-center justify-center">
            <MoveRight className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Lead Peek Card ────────────────────────────────────────────────────────────

function LeadPeekCard({
  lead, stages, onClose,
}: { lead: PipelineLead; stages: Stage[]; onClose: () => void }) {
  const stage = stages.find((s) => s.id === lead.stage_id)
  const initials = `${lead.first_name[0] ?? ""}${(lead.last_name ?? "")[0] ?? ""}`.toUpperCase() || "?"
  return (
    <div className="absolute right-4 bottom-4 w-[360px] rounded-2xl glass-3 gloss-edge p-5 z-30
                    animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-bold
                        bg-gradient-to-br from-sky-400 to-sky-600
                        shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_12px_rgba(14,165,233,0.28)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-slate-900 truncate">{lead.first_name} {lead.last_name ?? ""}</p>
          <p className="text-[12px] text-slate-500 truncate">{lead.email ?? "—"}</p>
        </div>
        {stage && (
          <span className="text-[10px] font-bold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200/60 shrink-0">
            {stage.name}
          </span>
        )}
        <button onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-y-2 gap-x-3 mt-4">
        <PeekRow label="Deal Value" value={lead.expected_value ? formatValue(lead.expected_value) : "—"} />
        <PeekRow label="Company"    value={lead.company_name ?? "—"} />
        <PeekRow label="Grade"      value={lead.grade} />
        <PeekRow label="Days in stage" value={`${daysInStage(lead.stage_entered_at)}d`} />
      </div>

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/60">
        <Link href={`/leads/${lead.id}`}
          className="flex-1 text-[12px] font-semibold text-sky-600 hover:text-sky-700 transition-colors">
          View Details →
        </Link>
        <Link href={`/leads/${lead.id}#actions`}
          className="text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
          Add Task
        </Link>
        <Link href={`/leads/${lead.id}#log`}
          className="text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
          Log Activity
        </Link>
      </div>
    </div>
  )
}
function PeekRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-[13px] font-semibold text-slate-800 truncate">{value}</p>
    </div>
  )
}

// ── Value Trend Chart ─────────────────────────────────────────────────────────

function ValueTrendChart({ trend, totalValue }: { trend: ValuePoint[]; totalValue: number }) {
  const W = 600, H = 180, PAD_T = 18, PAD_B = 24, PAD_L = 8, PAD_R = 8
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const max = Math.max(...trend.map((p) => p.value), 1)
  const xs = trend.map((_, i) => PAD_L + (i / Math.max(trend.length - 1, 1)) * innerW)
  const ys = trend.map((p) => PAD_T + (1 - p.value / max) * innerH)
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")
  const area = trend.length > 1 ? `${path} L${xs[xs.length - 1]},${PAD_T + innerH} L${xs[0]},${PAD_T + innerH} Z` : ""

  const firstDate = trend[0]?.date
  const lastDate  = trend[trend.length - 1]?.date
  function fmt(d?: string) { return d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "" }

  return (
    <div className="rounded-2xl glass-2 gloss-edge p-5 h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[14px] font-bold text-slate-900">Deal Value Over Time</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Won revenue · last 30 days</p>
        </div>
        <p className="text-[18px] font-bold text-slate-900 tabular-nums">{formatValue(totalValue)}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-44">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0EA5E9" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={PAD_L} y1={PAD_T + p * innerH} x2={W - PAD_R} y2={PAD_T + p * innerH}
                stroke="rgba(15,23,42,0.04)" strokeWidth="1" />
        ))}
        {area && <path d={area} fill="url(#trend-fill)" />}
        {area && <path d={path} fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
        <span>{fmt(firstDate)}</span>
        <span>{fmt(lastDate)}</span>
      </div>
    </div>
  )
}

// ── Source Donut ──────────────────────────────────────────────────────────────

function SourceDonut({ sources, totalLeads }: { sources: SourceRow[]; totalLeads: number }) {
  const COLORS: Record<string, string> = {
    sky: "#0EA5E9", violet: "#8B5CF6", mint: "#10B981", peach: "#FB923C", amber: "#F59E0B", ink: "#94A3B8",
  }
  const total = sources.reduce((a, b) => a + b.count, 0) || 1
  const r = 52, c = 2 * Math.PI * r
  let offset = 0
  const segments = sources.map((s) => {
    const len = (s.count / total) * c
    const seg = { color: COLORS[s.color] ?? COLORS.ink, dasharray: `${len} ${c - len}`, dashoffset: -offset }
    offset += len
    return seg
  })

  return (
    <div className="rounded-2xl glass-2 gloss-edge p-5 h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[14px] font-bold text-slate-900">Deals by Source</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Top sources this month</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg width="128" height="128" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(15,23,42,0.05)" strokeWidth="14" />
            {segments.map((s, i) => (
              <circle key={i} cx="64" cy="64" r={r} fill="none"
                      stroke={s.color} strokeWidth="14" strokeLinecap="butt"
                      strokeDasharray={s.dasharray} strokeDashoffset={s.dashoffset}
                      transform="rotate(-90 64 64)" />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[20px] font-bold text-slate-900 tabular-nums leading-none">{totalLeads}</p>
            <p className="text-[9px] font-mono uppercase text-slate-400 mt-1 tracking-wider">Total Deals</p>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          {sources.length === 0 ? (
            <p className="text-[11px] text-slate-400">No source data yet.</p>
          ) : sources.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-[11px]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${SOURCE_COLOR[s.color] ?? "bg-slate-400"}`} />
              <span className="font-semibold text-slate-700 truncate flex-1">{s.name}</span>
              <span className="text-slate-500 tabular-nums">{s.count}</span>
              <span className="text-slate-400 tabular-nums">({s.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <div className="rounded-2xl glass-2 gloss-edge p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[14px] font-bold text-slate-900">Recent Activities</p>
        <Link href="/notifications" className="text-[11px] font-semibold text-sky-600 hover:text-sky-700">
          View all
        </Link>
      </div>
      <div className="space-y-2.5 flex-1">
        {activities.length === 0 ? (
          <p className="text-[12px] text-slate-400">Quiet hour. New activity will land here.</p>
        ) : activities.map((a) => {
          const meta = ACTIVITY_ICON[a.category] ?? ACTIVITY_ICON.system
          const Icon = meta.icon
          return (
            <Link key={a.id} href={`/leads/${a.lead_id}`}
              className="flex items-start gap-2.5 group">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0
                                bg-gradient-to-br ${meta.color}
                                shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_2px_6px_rgba(15,23,42,0.08)]`}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-slate-700 leading-tight">
                  <span className="font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">{a.lead_name}</span>
                  <span className="text-slate-500"> · {a.label}</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{relativeTime(a.ts)}</p>
              </div>
            </Link>
          )
        })}
      </div>
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl glass-3 gloss-edge p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-slate-900">Move Stage</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentStage && (
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <span className="px-2 py-0.5 rounded-full bg-white/60 text-slate-600 font-medium border border-slate-200/60">{currentStage.name}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">select below</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Move to</label>
          <div className="grid grid-cols-2 gap-2">
            {otherStages.map((s) => {
              const isBack = (s.order < (currentStage?.order ?? 0))
              const active = selectedStageId === s.id
              return (
                <button key={s.id} onClick={() => setSelectedStageId(s.id)}
                  className={`px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all duration-150 text-left ${
                    active
                      ? "bg-gradient-to-b from-sky-400 to-sky-500 text-white border-sky-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                      : isBack
                        ? "bg-white/60 text-slate-500 border-slate-200/70 hover:border-slate-300"
                        : "bg-white/80 text-slate-700 border-slate-200/70 hover:border-sky-300 hover:text-sky-700"
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
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Reason for moving back <span className="text-rose-500">*</span>
            </label>
            <textarea rows={2}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] bg-white/80
                         focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
              placeholder="e.g. Customer went quiet, re-qualifying…"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold
                       text-slate-600 hover:bg-white/70 transition-all duration-150 bg-white/40">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !selectedStageId}
            className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold transition-all duration-150
                       bg-gradient-to-b from-sky-400 to-sky-500
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                       disabled:opacity-50">
            {saving ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl glass-3 gloss-edge p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-slate-900">Mark as Won</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Deal Value (₹) <span className="text-rose-500">*</span>
          </label>
          <input type="number"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] bg-white/80
                       focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="e.g. 50000" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Win Reason <span className="text-rose-500">*</span>
          </label>
          <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] bg-white/80
                             focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select reason…</option>
            {["COMPETITIVE_PRICE","BEST_FIT","REFERRAL_TRUST","FAST_DELIVERY","EXISTING_RELATIONSHIP","OTHER"]
              .map(r => <option key={r} value={r}>{r.replace(/_/g," ")}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold
                       text-slate-600 hover:bg-white/70 transition-all duration-150 bg-white/40">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold transition-all duration-150
                       bg-gradient-to-b from-emerald-400 to-emerald-500
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(16,185,129,0.32)]
                       disabled:opacity-50">
            {saving ? "Saving…" : "Mark Won"}
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl glass-3 gloss-edge p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-slate-900">Mark as Lost</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Loss Reason <span className="text-rose-500">*</span>
          </label>
          <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] bg-white/80
                             focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select reason…</option>
            {["PRICE_TOO_HIGH","WENT_COMPETITOR","NO_BUDGET","NO_RESPONSE","REQUIREMENT_CHANGED","WRONG_FIT","OTHER"]
              .map(r => <option key={r} value={r}>{r.replace(/_/g," ")}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold
                       text-slate-600 hover:bg-white/70 transition-all duration-150 bg-white/40">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold transition-all duration-150
                       bg-gradient-to-b from-rose-400 to-rose-500
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(244,63,94,0.32)]
                       disabled:opacity-50">
            {saving ? "Saving…" : "Mark Lost"}
          </button>
        </div>
      </div>
    </div>
  )
}
