"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Search, Download, ChevronDown, X, ArrowUpRight,
  Check, Calendar, Zap, Users2, Flame,
} from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { timeAgo } from "@/lib/format"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lead {
  id:             string
  first_name:     string
  last_name:      string | null
  phone:          string
  email:          string | null
  grade:          string
  company_name:   string | null
  city:           string | null
  state:          string | null
  expected_value: number | null
  created_at:     string
  imported_at:    string | null
  is_junk:        boolean
  // Three scoring dimensions (each 0–100 internally)
  fit_score:      number
  intent_score:   number
  quality_score:  number
  // Most-recent signal — drives the "Last Activity" column
  signals?:       { created_at: string; signal_type: string }[]
  stage:          { id: string; name: string; key: string } | null
  source:         { id: string; name: string; key: string } | null
  assigned_rep:   { id: string; first_name: string; last_name: string | null } | null
  next_action:    { label: string; reason: string; priority: number; color: string }
}

interface StatsResponse {
  scoring_speed_ms: number | null
  score_breakdown: {
    avg_total:         number
    avg_fit:           number
    avg_intent:        number
    avg_quality:       number
    fit_share_pct:     number
    intent_share_pct:  number
    quality_share_pct: number
  }
  score_decay: { pct: number | null; window_days: number | null }
  lead_count: number
}

interface PipelineStage {
  id:            string
  name:          string
  key:           string
  order:         number
  display_order: number
  is_terminal:   boolean
  is_won:        boolean
  is_lost:       boolean
}

interface LeadSource {
  id:   string
  name: string
  key:  string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
}

function repInitials(firstName: string, lastName: string | null): string {
  return [firstName[0], lastName?.[0]].filter(Boolean).join("").toUpperCase().slice(0, 2)
}

const REP_PALETTES = [
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700",
]

function repPalette(id: string): string {
  const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return REP_PALETTES[hash % REP_PALETTES.length]
}

// Weighted total score (0-100). Mirrors /api/leads/stats and the design:
// Fit is weighted 40%, Intent 30%, Quality 30%.
function computeTotalScore(fit: number, intent: number, quality: number): number {
  return Math.round(fit * 0.40 + intent * 0.30 + quality * 0.30)
}

// Bar fill gradient picked by score quartile — same logic across all 3 dimensions
function barGradient(score: number): string {
  if (score >= 75) return "linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)" // mint
  if (score >= 55) return "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)" // sky
  if (score >= 35) return "linear-gradient(180deg, #FDBA74 0%, #FB923C 100%)" // peach
  return "linear-gradient(180deg, #F87171 0%, #DC2626 100%)"                  // red
}

// Total-score color — used by the bold "Score" cell value
function scoreColorClass(score: number): string {
  if (score >= 75) return "text-emerald-600"
  if (score >= 55) return "text-sky-600"
  if (score >= 35) return "text-orange-500"
  return "text-red-500"
}

// ── ScoreBarCell — small "X/40" or "X/30" tile with coloured fill ────────────

function ScoreBarCell({ score, weight }: { score: number; weight: 40 | 30 }) {
  const display = Math.round((score * weight) / 100)
  const pct     = Math.max(0, Math.min(100, score))
  const fill    = barGradient(score)
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1">
        <span className="text-[12px] font-bold text-ink tabular-nums leading-none">{display}</span>
        <span className="text-[10px] text-ink-muted tabular-nums leading-none">/{weight}</span>
      </div>
      <div
        className="h-[3px] w-full rounded-full overflow-hidden"
        style={{ background: "rgba(15,23,42,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
    </div>
  )
}

// ── ScoreDonut — conic gradient with centre value (Score Breakdown card) ─────

function ScoreDonut({
  avgTotal, fitPct, intentPct,
}: { avgTotal: number; fitPct: number; intentPct: number }) {
  const f = fitPct
  const i = f + intentPct
  return (
    <div className="relative w-[110px] h-[110px] shrink-0">
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(
            #10B981 0% ${f}%,
            #0EA5E9 ${f}% ${i}%,
            #FB923C ${i}% 100%
          )`,
          boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-[10px] rounded-full flex flex-col items-center justify-center"
        style={{
          background: "var(--bg-pure)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,1), 0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        <span className="text-[24px] font-bold text-ink tabular-nums leading-none">{avgTotal}</span>
        <span className="text-[9px] font-semibold text-ink-muted uppercase tracking-[0.10em] mt-0.5">/100</span>
      </div>
    </div>
  )
}

// ── MiniSparkline — tiny SVG line for Score Decay card ──────────────────────

function MiniSparkline({ pct }: { pct: number | null }) {
  const W = 100, H = 36
  const downward = pct === null ? false : pct < 0
  const upward   = pct === null ? false : pct > 0
  const N = 8
  const pts = Array.from({ length: N }, (_, idx) => {
    const x = (idx / (N - 1)) * (W - 4) + 2
    const baseY = downward ? (idx / (N - 1)) * (H - 8) + 4
                : upward    ? H - 4 - (idx / (N - 1)) * (H - 8)
                : H / 2
    const jitter = (idx % 2 === 0 ? -1 : 1) * 1.8
    const y = Math.max(2, Math.min(H - 2, baseY + jitter))
    return [x, y] as const
  })
  const path = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const stroke = pct === null ? "#94A3B8" : pct < 0 ? "#FB923C" : "#10B981"
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <polyline
        points={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r={1.75} fill={stroke} />
      ))}
    </svg>
  )
}

// ── StatCard — wrapper for the 3 stats tiles below the table ────────────────

function StatCard({
  label,
  children,
  icon,
  className = "",
}: {
  label:  string
  icon?:  React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`glass-2 gloss-edge rounded-2xl p-5 ${className}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold text-ink-muted uppercase tracking-[0.14em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

// ── RepAvatar ─────────────────────────────────────────────────────────────────

function RepAvatar({
  firstName, lastName, repId, size = "md",
}: {
  firstName: string; lastName: string | null; repId: string; size?: "sm" | "md"
}) {
  const palette  = repPalette(repId)
  const initials = repInitials(firstName, lastName)
  const cls      = size === "sm" ? "w-5 h-5 text-[9px]" : "w-7 h-7 text-[11px]"
  return (
    <div
      className={`${cls} ${palette} rounded-full flex items-center justify-center font-bold shrink-0`}
      title={`${firstName} ${lastName ?? ""}`}
    >
      {initials}
    </div>
  )
}

// ── RepCell — inline rep reassignment (managers) ────────────────────────────────

function RepCell({
  leadId, current, members, onUpdated,
}: {
  leadId:    string
  current:   { id: string; first_name: string; last_name: string | null } | null
  members:   { id: string; first_name: string; last_name: string | null }[]
  onUpdated: () => void
}) {
  const [open, setOpen]     = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  async function assign(repId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/assign`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rep_id: repId }),
      })
      if (res.ok) { toast.success("Rep reassigned"); onUpdated(); setOpen(false) }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Failed to reassign") }
    } catch { toast.error("Failed to reassign") }
    finally { setSaving(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="flex items-center gap-0.5 rounded-full hover:bg-slate-100 p-0.5 transition-colors"
        title="Reassign rep"
      >
        {current ? (
          <RepAvatar firstName={current.first_name} lastName={current.last_name} repId={current.id} size="md" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
            <span className="text-[9px] text-ink-muted font-semibold">—</span>
          </div>
        )}
        <ChevronDown className="w-2.5 h-2.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-slate-200 shadow-xl min-w-[190px] py-1 overflow-hidden max-h-60 overflow-y-auto">
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => assign(m.id)}
              disabled={saving}
              className={`w-full text-left px-3 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center gap-2 transition-colors disabled:opacity-50 ${
                current?.id === m.id ? "text-sky-700 font-semibold" : "text-slate-700"
              }`}
            >
              <RepAvatar firstName={m.first_name} lastName={m.last_name} repId={m.id} size="sm" />
              <span className="truncate">{m.first_name} {m.last_name ?? ""}</span>
              {current?.id === m.id && <Check className="w-3 h-3 text-sky-600 shrink-0 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── FilterChip ────────────────────────────────────────────────────────────────

function FilterChip({
  label, value, onClear, icon, children,
}: {
  label:    string
  value?:   string
  onClear:  () => void
  icon?:    React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const isActive = !!value

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center rounded-full border text-[12px] font-medium transition-all ${
        isActive
          ? "bg-sky-100/60 border-sky-300/60 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_2px_6px_rgba(14,165,233,0.14)]"
          : "glass-1 border-white/70 text-slate-600 hover:text-slate-900"
      }`}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 pl-3 pr-2 py-[7px]"
        >
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="max-w-[110px] truncate">{value ?? label}</span>
          <ChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        </button>
        {isActive && (
          <button
            onClick={e => { e.stopPropagation(); onClear() }}
            className="pr-2.5 py-[7px] text-sky-500 hover:text-sky-700 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && (
        // Outer holds the positioning; inner holds the glass styling. `gloss-edge`
        // sets `position: relative` (for its ::before), which would otherwise
        // override `absolute` and push the page down in normal flow.
        <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[180px]">
          <div className="rounded-xl glass-3 gloss-edge overflow-hidden">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

// ── StageCell ─────────────────────────────────────────────────────────────────

function StageCell({
  leadId, stageId, stageName, stageOrder, stages, onUpdated,
}: {
  leadId:     string
  stageId:    string
  stageName:  string
  stageOrder: number
  stages:     PipelineStage[]
  onUpdated:  () => void
}) {
  const [open, setOpen]               = useState(false)
  const [noteOpen, setNoteOpen]       = useState(false)
  const [pending, setPending]         = useState<PipelineStage | null>(null)
  const [note, setNote]               = useState("")
  const [saving, setSaving]           = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  async function submit(newStageId: string, noteText: string | null) {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: newStageId, note: noteText }),
      })
      if (res.ok) {
        toast.success("Stage updated")
        onUpdated()
        setNoteOpen(false)
        setNote("")
        setPending(null)
      } else {
        const e = await res.json()
        toast.error(e.error ?? "Failed to update stage")
      }
    } catch { toast.error("Failed to update stage") }
    finally { setSaving(false) }
  }

  function handleSelect(stage: PipelineStage) {
    setOpen(false)
    const isBackward = stage.order < stageOrder
    if (isBackward) { setPending(stage); setNoteOpen(true); return }
    submit(stage.id, null)
  }

  const nonTerminal = stages.filter(s => !s.is_terminal)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="flex items-center gap-1 text-[12px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-full px-2.5 py-1 transition-colors"
      >
        <span className="max-w-[120px] truncate">{stageName || "—"}</span>
        <ChevronDown className="w-2.5 h-2.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-slate-200 shadow-xl min-w-[180px] py-1 overflow-hidden">
          {nonTerminal.map(s => (
            <button
              key={s.id}
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center justify-between transition-colors ${
                s.id === stageId ? "text-sky-700 font-semibold" : "text-slate-700"
              }`}
            >
              {s.name}
              {s.id === stageId && <Check className="w-3 h-3 text-sky-600 shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {/* Backward-move note modal */}
      {noteOpen && pending && (
        <ModalPortal>
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4 mx-4">
            <div>
              <p className="text-[14px] font-bold text-slate-900">Move back to &ldquo;{pending.name}&rdquo;?</p>
              <p className="text-[12px] text-slate-500 mt-0.5">A note is required when moving a lead backwards.</p>
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Why is this lead being moved back?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-500/30 resize-none h-24"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setNoteOpen(false); setNote(""); setPending(null) }}
                className="flex-1 h-9 rounded-full border border-slate-200 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >Cancel</button>
              <button
                onClick={() => note.trim() && submit(pending.id, note.trim())}
                disabled={!note.trim() || saving}
                className="flex-1 h-9 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] text-[12px] font-bold text-white transition-colors disabled:opacity-50"
              >{saving ? "Moving…" : "Confirm"}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { data: session } = useCurrentUser()
  const queryClient       = useQueryClient()
  const searchParams      = useSearchParams()
  const router            = useRouter()
  const isManager         = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"

  const [search,       setSearch]       = useState("")
  const [grade,        setGrade]        = useState("all")
  const [stageFilter,  setStageFilter]  = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [repFilter,    setRepFilter]    = useState("all")
  const [dateFrom,     setDateFrom]     = useState("")
  const [dateTo,       setDateTo]       = useState("")
  const [batch,        _setBatch]       = useState(searchParams.get("batch") ?? "all")
  const [page,         setPage]         = useState(1)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [exporting,    setExporting]    = useState(false)
  const [checkedIds,   setCheckedIds]   = useState<Set<string>>(new Set())
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const autoRegradeRef = useRef(false)

  // Clear ?batch from URL
  useEffect(() => {
    if (searchParams.get("batch")) router.replace("/leads", { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-regrade silently on load
  useEffect(() => {
    if (!isManager || autoRegradeRef.current) return
    autoRegradeRef.current = true
    fetch("/api/admin/regrade", { method: "POST", credentials: "include" })
      .then(r => r.json())
      .then(d => { if ((d.updated ?? 0) > 0) queryClient.invalidateQueries({ queryKey: ["leads"] }) })
      .catch(() => {})
  }, [isManager, queryClient])

  // Build params
  const params = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = { page: String(page) }
    if (search)              p.search    = search
    if (grade !== "all")     p.grade     = grade
    if (stageFilter  !== "all") p.stage  = stageFilter
    if (sourceFilter !== "all") p.source = sourceFilter
    if (repFilter    !== "all") p.rep    = repFilter
    if (dateFrom)            p.date_from = dateFrom
    if (dateTo)              p.date_to   = dateTo
    if (batch !== "all")     p.batch     = batch
    return p
  }, [page, search, grade, stageFilter, sourceFilter, repFilter, dateFrom, dateTo, batch])

  // ── Data queries
  const { data, isLoading } = useQuery({
    queryKey: ["leads", params],
    queryFn: () => {
      const qs = new URLSearchParams(params).toString()
      return fetch(`/api/leads?${qs}`, { credentials: "include" }).then(r => r.json())
    },
    staleTime: 30_000,
  })

  const { data: stagesData } = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn:  () => fetch("/api/pipeline/stages", { credentials: "include" }).then(r => r.json()),
    staleTime: 300_000,
  })

  const { data: sourcesData } = useQuery({
    queryKey: ["lead-sources"],
    queryFn:  () => fetch("/api/lead-sources", { credentials: "include" }).then(r => r.json()),
    staleTime: 300_000,
  })

  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  () => fetch("/api/team/members", { credentials: "include" }).then(r => r.json()),
    enabled:  !!isManager,
    staleTime: 300_000,
  })

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["leads-stats"],
    queryFn:  () => fetch("/api/leads/stats", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  })

  const leads:   Lead[]          = data?.leads   ?? []
  const total:   number          = data?.total   ?? 0
  const pages:   number          = data?.pages   ?? 1
  const stages:  PipelineStage[] = stagesData?.stages ?? []
  const sources: LeadSource[]    = sourcesData?.sources ?? []
  const members                  = teamData?.members ?? []

  const activeFilters = [
    grade !== "all", stageFilter !== "all", sourceFilter !== "all",
    repFilter !== "all", !!(dateFrom || dateTo),
  ].filter(Boolean).length

  const hotLeads = leads.filter(l => l.grade === "A")

  // ── CSV export
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const all: Lead[] = []
      const exportParams = { ...params }
      delete exportParams.page

      let pg = 1, totalPg = 1
      while (pg <= totalPg && pg <= 20) {
        const qs = new URLSearchParams({ ...exportParams, page: String(pg) }).toString()
        const res = await fetch(`/api/leads?${qs}`, { credentials: "include" })
        const d = await res.json()
        all.push(...(d.leads ?? []))
        totalPg = d.pages ?? 1
        pg++
      }

      const headers = ["Name","Phone","Email","Grade","Company","City","State","Stage","Source","Rep","Expected Value (₹)","Added"]
      const rows = all.map(l => [
        `"${[l.first_name, l.last_name].filter(Boolean).join(" ")}"`,
        l.phone ?? "",
        l.email ?? "",
        l.grade ?? "",
        `"${l.company_name ?? ""}"`,
        l.city  ?? "",
        l.state ?? "",
        `"${l.stage?.name  ?? ""}"`,
        `"${l.source?.name ?? ""}"`,
        `"${l.assigned_rep ? `${l.assigned_rep.first_name} ${l.assigned_rep.last_name ?? ""}`.trim() : ""}"`,
        l.expected_value ?? "",
        formatDate(l.imported_at ?? l.created_at),
      ])

      const csv  = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href = url
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${all.length} leads`)
    } catch { toast.error("Export failed") }
    finally { setExporting(false) }
  }, [params])

  function clearFilters() {
    setGrade("all"); setStageFilter("all"); setSourceFilter("all")
    setRepFilter("all"); setDateFrom(""); setDateTo(""); setSearch(""); setPage(1)
  }

  // Clear bulk selection when page/filters change
  useEffect(() => { setCheckedIds(new Set()) }, [page, grade, stageFilter, sourceFilter, repFilter, search])

  function toggleCheck(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleCheckAll() {
    if (leads.length > 0 && leads.every(l => checkedIds.has(l.id))) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(leads.map(l => l.id)))
    }
  }

  async function handleBulkAssign(repId: string) {
    if (!repId) return
    setBulkAssigning(true)
    const ids = Array.from(checkedIds)
    try {
      const results = await Promise.all(ids.map(id =>
        fetch(`/api/leads/${id}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ rep_id: repId }),
        }).then(r => r.ok).catch(() => false)
      ))
      const ok = results.filter(Boolean).length
      const failed = ids.length - ok
      setCheckedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      if (ok === 0) {
        toast.error("Could not assign leads. Please try again.")
      } else if (failed > 0) {
        toast.success(`Assigned ${ok} lead${ok !== 1 ? "s" : ""} · ${failed} failed`)
      } else {
        toast.success(`Assigned ${ok} lead${ok !== 1 ? "s" : ""}`)
      }
    } finally {
      setBulkAssigning(false)
    }
  }

  function handleBulkExport() {
    const selected = leads.filter(l => checkedIds.has(l.id))
    const headers  = ["Name","Phone","Email","Grade","Company","City","Stage","Source","Rep","Expected Value (₹)","Added"]
    const rows     = selected.map(l => [
      `"${[l.first_name, l.last_name].filter(Boolean).join(" ")}"`,
      l.phone ?? "", l.email ?? "", l.grade ?? "",
      `"${l.company_name ?? ""}"`, l.city ?? "",
      `"${l.stage?.name  ?? ""}"`, `"${l.source?.name ?? ""}"`,
      `"${l.assigned_rep ? `${l.assigned_rep.first_name} ${l.assigned_rep.last_name ?? ""}`.trim() : ""}"`,
      l.expected_value ?? "", formatDate(l.imported_at ?? l.created_at),
    ])
    const csv  = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = `leads-selected-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 max-w-7xl">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white
                          bg-gradient-to-br from-sky-400 to-sky-600
                          shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
            <Users2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">All Leads</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {isLoading
                ? "Loading…"
                : `${total.toLocaleString()} lead${total !== 1 ? "s" : ""}${activeFilters > 0 ? " · filtered" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || isLoading}
            className="flex items-center gap-1.5 h-9 px-4 rounded-full glass-1 border border-white/70 text-[12px] font-semibold text-slate-700 hover:text-slate-900 transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          {isManager && (
            <Link href="/leads/import"
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-full text-white text-[12px] font-semibold
                         bg-gradient-to-b from-sky-400 to-sky-500
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                         hover:from-sky-500 hover:to-sky-600 transition-all active:scale-[0.98]">
              <span className="text-[14px] font-bold leading-none">+</span> Import
            </Link>
          )}
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name, phone, company…"
            className="pl-9 pr-3 h-9 w-60 rounded-full glass-1 border border-white/70 text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all"
          />
        </div>

        {/* Grade */}
        <FilterChip
          label="Grade"
          value={grade !== "all" ? `Grade ${grade}` : undefined}
          onClear={() => { setGrade("all"); setPage(1) }}
        >
          <div className="py-1">
            {["all", "A", "B", "C", "D", "E", "F"].map(g => (
              <button key={g}
                onClick={() => { setGrade(g); setPage(1) }}
                className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center justify-between transition-colors ${grade === g ? "text-sky-700 font-semibold" : "text-slate-700"}`}
              >
                {g === "all" ? "All grades" : `Grade ${g}`}
                {grade === g && <Check className="w-3 h-3 text-sky-600 shrink-0" />}
              </button>
            ))}
          </div>
        </FilterChip>

        {/* Stage */}
        <FilterChip
          label="Stage"
          value={stageFilter !== "all" ? stages.find(s => s.id === stageFilter)?.name : undefined}
          onClear={() => { setStageFilter("all"); setPage(1) }}
        >
          <div className="py-1 max-h-52 overflow-y-auto">
            <button onClick={() => { setStageFilter("all"); setPage(1) }}
              className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center justify-between transition-colors ${stageFilter === "all" ? "text-sky-700 font-semibold" : "text-slate-700"}`}
            >All stages{stageFilter === "all" && <Check className="w-3 h-3 text-sky-600 shrink-0" />}</button>
            {stages.map(s => (
              <button key={s.id} onClick={() => { setStageFilter(s.id); setPage(1) }}
                className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center justify-between transition-colors ${stageFilter === s.id ? "text-sky-700 font-semibold" : "text-slate-700"}`}
              >
                <span className="truncate">{s.name}</span>
                {stageFilter === s.id && <Check className="w-3 h-3 text-sky-600 shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </FilterChip>

        {/* Source */}
        <FilterChip
          label="Source"
          value={sourceFilter !== "all" ? sources.find(s => s.id === sourceFilter)?.name : undefined}
          onClear={() => { setSourceFilter("all"); setPage(1) }}
        >
          <div className="py-1 max-h-52 overflow-y-auto">
            <button onClick={() => { setSourceFilter("all"); setPage(1) }}
              className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center justify-between transition-colors ${sourceFilter === "all" ? "text-sky-700 font-semibold" : "text-slate-700"}`}
            >All sources{sourceFilter === "all" && <Check className="w-3 h-3 text-sky-600 shrink-0" />}</button>
            {sources.map(s => (
              <button key={s.id} onClick={() => { setSourceFilter(s.id); setPage(1) }}
                className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center justify-between transition-colors ${sourceFilter === s.id ? "text-sky-700 font-semibold" : "text-slate-700"}`}
              >
                <span className="truncate">{s.name}</span>
                {sourceFilter === s.id && <Check className="w-3 h-3 text-sky-600 shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </FilterChip>

        {/* Rep (managers only) */}
        {isManager && members.length > 0 && (
          <FilterChip
            label="Rep"
            value={repFilter !== "all" ? members.find((m: { id: string }) => m.id === repFilter)?.first_name : undefined}
            onClear={() => { setRepFilter("all"); setPage(1) }}
          >
            <div className="py-1">
              <button onClick={() => { setRepFilter("all"); setPage(1) }}
                className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center justify-between transition-colors ${repFilter === "all" ? "text-sky-700 font-semibold" : "text-slate-700"}`}
              >All reps{repFilter === "all" && <Check className="w-3 h-3 text-sky-600 shrink-0" />}</button>
              {members.map((m: { id: string; first_name: string; last_name: string | null }) => (
                <button key={m.id} onClick={() => { setRepFilter(m.id); setPage(1) }}
                  className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-sky-50 hover:text-sky-700 flex items-center gap-2 transition-colors ${repFilter === m.id ? "text-sky-700 font-semibold" : "text-slate-700"}`}
                >
                  <RepAvatar firstName={m.first_name} lastName={m.last_name} repId={m.id} size="sm" />
                  {m.first_name} {m.last_name ?? ""}
                </button>
              ))}
            </div>
          </FilterChip>
        )}

        {/* Date range */}
        <FilterChip
          label="Date added"
          icon={<Calendar className="w-3 h-3" />}
          value={(dateFrom || dateTo) ? `${dateFrom || "Any"} – ${dateTo || "today"}` : undefined}
          onClear={() => { setDateFrom(""); setDateTo(""); setPage(1) }}
        >
          <div className="p-3 space-y-2.5 min-w-[210px]">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">From</p>
              <input type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">To</p>
              <input type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
            </div>
          </div>
        </FilterChip>

        {/* Clear all */}
        {activeFilters > 0 && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>

      {/* ── Hot leads alert ───────────────────────────────────────────────── */}
      {hotLeads.length > 0 && grade === "all" && (
        <button
          onClick={() => { setGrade("A"); setPage(1) }}
          className="relative overflow-hidden w-full flex items-center gap-3 rounded-2xl glass-3 gloss-edge px-5 py-3.5 text-left transition-all active:scale-[0.995] hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
        >
          {/* peach signature blob */}
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full pointer-events-none opacity-70"
               style={{ background: "radial-gradient(closest-side, rgba(253,186,116,0.45), transparent 70%)" }} />
          {/* sky aura blob */}
          <div className="absolute -left-12 -bottom-10 w-40 h-40 rounded-full pointer-events-none opacity-50"
               style={{ background: "radial-gradient(closest-side, rgba(56,189,248,0.32), transparent 70%)" }} />

          <div className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0
                          bg-gradient-to-br from-orange-300 to-orange-500
                          shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_4px_12px_rgba(251,146,60,0.32)]">
            <Flame className="w-4 h-4" strokeWidth={2.5} />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-[13px] font-bold text-slate-900">
              {hotLeads.length} Grade A lead{hotLeads.length > 1 ? "s" : ""} need immediate attention
            </p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {hotLeads.slice(0, 3).map(l => `${l.first_name} ${l.last_name ?? ""}`.trim()).join(" · ")}
              {hotLeads.length > 3 ? ` +${hotLeads.length - 3} more` : ""}
            </p>
          </div>
          <ArrowUpRight className="relative w-4 h-4 text-sky-600 shrink-0" />
        </button>
      )}

      {/* ── Leads table ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl glass-2 gloss-edge overflow-x-auto">

        {/* Header row — shows column labels normally, or the bulk actions when
            leads are selected. Both occupy the SAME fixed-height row, so
            selecting a lead never pushes the table down. */}
        <div className={`grid grid-cols-[32px_1fr_56px_48px_88px_88px_88px_130px_52px_92px] gap-x-3 min-w-[900px] items-center px-5 min-h-[44px] border-b ${
          checkedIds.size > 0 ? "bg-sky-100/40 border-sky-200/40" : "border-slate-100"
        }`}>
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={leads.length > 0 && leads.every(l => checkedIds.has(l.id))}
              onChange={toggleCheckAll}
              className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer"
            />
          </div>

          {checkedIds.size > 0 ? (
            <div className="flex items-center gap-3" style={{ gridColumn: "2 / -1" }}>
              <span className="text-[12px] font-semibold text-sky-700 tabular-nums">
                {checkedIds.size} selected
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={handleBulkExport}
                  className="h-7 px-3 rounded-full glass-1 border border-white/70 text-sky-700
                             text-[12px] font-semibold hover:text-sky-800 transition-all active:scale-[0.97]"
                >
                  Export CSV
                </button>
                {isManager && members.length > 0 && (
                  <ThemedSelect
                    variant="pill"
                    className="!h-7 text-sky-700"
                    value=""
                    onValueChange={(v) => { if (v) handleBulkAssign(v) }}
                    options={members.map((m: { id: string; first_name: string; last_name: string | null }) => ({ value: m.id, label: `${m.first_name} ${m.last_name ?? ""}`.trim() }))}
                    placeholder={bulkAssigning ? "Assigning…" : "Assign to rep…"}
                    disabled={bulkAssigning}
                    aria-label="Bulk assign to rep"
                  />
                )}
                <button
                  onClick={() => setCheckedIds(new Set())}
                  className="h-7 w-7 flex items-center justify-center rounded-full
                             text-sky-500 hover:text-sky-700 hover:bg-white/70 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            [
              { label: "Lead",          align: "left"  },
              { label: "Score",         align: "right" },
              { label: "Grade",         align: "center"},
              { label: "Fit",           align: "left"  },
              { label: "Intent",        align: "left"  },
              { label: "Quality",       align: "left"  },
              { label: "Stage",         align: "left"  },
              { label: "Rep",           align: "left"  },
              { label: "Last activity", align: "right" },
            ].map(({ label, align }) => (
              <span
                key={label}
                className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]"
                style={{ textAlign: align as "left"|"right"|"center" }}
              >
                {label}
              </span>
            ))
          )}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="divide-y divide-slate-50">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="grid grid-cols-[32px_1fr_56px_48px_88px_88px_88px_130px_52px_92px] gap-x-3 min-w-[900px] px-5 py-3.5 items-center">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-8 ml-auto" />
                <Skeleton className="h-6 w-6 rounded-full mx-auto" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-3 w-14 ml-auto" />
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center">
            {(() => {
              const hasActiveFilters = search !== "" || grade !== "all" || stageFilter !== "all" || sourceFilter !== "all" || repFilter !== "all" || dateFrom !== "" || dateTo !== "" || batch !== "all"
              return (
                <>
                  <p className="text-[14px] font-semibold text-slate-900">
                    {hasActiveFilters ? "No leads match these filters" : "No leads yet"}
                  </p>
                  <p className="text-[12px] text-slate-400 mt-1.5">
                    {hasActiveFilters
                      ? "Try removing a filter to broaden your search."
                      : "Import leads to start tracking your pipeline."}
                  </p>
                  {!hasActiveFilters && (
                    <Link
                      href="/leads/import"
                      className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-full text-white
                                 bg-gradient-to-b from-sky-400 to-sky-500
                                 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                                 text-[12px] font-semibold transition-all active:scale-[0.98]"
                    >
                      Import leads →
                    </Link>
                  )}
                </>
              )
            })()}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {leads.map(lead => {
              const totalScore  = computeTotalScore(lead.fit_score, lead.intent_score, lead.quality_score)
              const lastSignal  = lead.signals?.[0]?.created_at
              const lastSeen    = lastSignal ?? lead.imported_at ?? lead.created_at
              return (
                <div
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`grid grid-cols-[32px_1fr_56px_48px_88px_88px_88px_130px_52px_92px] gap-x-3 min-w-[900px] px-5 py-3.5 items-center cursor-pointer transition-colors group ${checkedIds.has(lead.id) ? "bg-sky-50/50" : "hover:bg-sky-50/40"}`}
                >
                  {/* Checkbox — the whole cell toggles once. The input is
                      display-only (pointer-events-none) so the click can't fire
                      both the input's onChange AND the div's onClick (which
                      previously cancelled each other out → checkbox did nothing). */}
                  <div
                    onClick={e => { e.stopPropagation(); toggleCheck(lead.id) }}
                    className="flex items-center cursor-pointer -my-1 py-1 pr-1"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(lead.id)}
                      readOnly
                      tabIndex={-1}
                      className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer pointer-events-none"
                    />
                  </div>

                  {/* Lead: name + secondary */}
                  <div className="min-w-0 pr-2">
                    <p className="text-[13px] font-semibold text-ink truncate leading-snug group-hover:text-sky-600 transition-colors">
                      {lead.first_name} {lead.last_name ?? ""}
                    </p>
                    <p className="text-[11px] text-ink-muted truncate mt-0.5">
                      {[lead.company_name, lead.city].filter(Boolean).join(" · ") || lead.phone}
                    </p>
                  </div>

                  {/* Score (numeric, weighted total) */}
                  <div className="text-right">
                    <span className={`text-[16px] font-bold tabular-nums leading-none ${scoreColorClass(totalScore)}`}>
                      {totalScore}
                    </span>
                  </div>

                  {/* Grade */}
                  <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                    <GradeBadge grade={lead.grade} size="sm" />
                  </div>

                  {/* Fit /40 */}
                  <div onClick={e => e.stopPropagation()}>
                    <ScoreBarCell score={lead.fit_score} weight={40} />
                  </div>

                  {/* Intent /30 */}
                  <div onClick={e => e.stopPropagation()}>
                    <ScoreBarCell score={lead.intent_score} weight={30} />
                  </div>

                  {/* Quality /30 */}
                  <div onClick={e => e.stopPropagation()}>
                    <ScoreBarCell score={lead.quality_score} weight={30} />
                  </div>

                  {/* Stage — inline edit */}
                  <div onClick={e => e.stopPropagation()}>
                    {stages.length > 0 ? (
                      <StageCell
                        leadId={lead.id}
                        stageId={lead.stage?.id ?? ""}
                        stageName={lead.stage?.name ?? "—"}
                        stageOrder={stages.find(s => s.id === lead.stage?.id)?.order ?? 0}
                        stages={stages}
                        onUpdated={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}
                      />
                    ) : (
                      <span className="text-[12px] text-ink-soft">{lead.stage?.name ?? "—"}</span>
                    )}
                  </div>

                  {/* Rep — inline reassign for managers, read-only otherwise */}
                  <div onClick={e => e.stopPropagation()}>
                    {isManager && members.length > 0 ? (
                      <RepCell
                        leadId={lead.id}
                        current={lead.assigned_rep}
                        members={members}
                        onUpdated={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}
                      />
                    ) : lead.assigned_rep ? (
                      <RepAvatar
                        firstName={lead.assigned_rep.first_name}
                        lastName={lead.assigned_rep.last_name}
                        repId={lead.assigned_rep.id}
                        size="md"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-[9px] text-ink-muted font-semibold">—</span>
                      </div>
                    )}
                  </div>

                  {/* Last activity (relative time) */}
                  <div className="text-right">
                    <span className="text-[11px] text-ink-muted tabular-nums" title={new Date(lastSeen).toLocaleString("en-IN")}>
                      {timeAgo(lastSeen)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Stats cards: Scoring Speed · Score Breakdown · Score Decay ─────── */}
      {!isLoading && leads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Scoring Speed */}
          <StatCard
            label="Scoring Speed"
            icon={<Zap className="w-3 h-3 text-sky-500" strokeWidth={2.5} />}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 10px rgba(14,165,233,0.22)",
                }}
              >
                <Zap className="w-5 h-5 text-sky-700" strokeWidth={2.5} fill="currentColor" />
              </div>
              <div>
                <p className="text-[30px] font-bold text-ink tabular-nums leading-none">
                  {stats?.scoring_speed_ms ?? "—"}
                  <span className="text-[14px] font-semibold text-ink-soft ml-1">ms</span>
                </p>
                <p className="text-[11px] text-ink-muted mt-1">
                  Average per lead
                </p>
              </div>
            </div>
          </StatCard>

          {/* Score Breakdown */}
          <StatCard label="Score Breakdown">
            <div className="flex items-center gap-4">
              {stats ? (
                <ScoreDonut
                  avgTotal={stats.score_breakdown.avg_total}
                  fitPct={stats.score_breakdown.fit_share_pct}
                  intentPct={stats.score_breakdown.intent_share_pct}
                />
              ) : (
                <div className="w-[110px] h-[110px] rounded-full bg-slate-100 animate-pulse" />
              )}
              <div className="flex-1 space-y-2">
                {stats && [
                  { label: "Fit",     pct: stats.score_breakdown.fit_share_pct,     dot: "#10B981" },
                  { label: "Intent",  pct: stats.score_breakdown.intent_share_pct,  dot: "#0EA5E9" },
                  { label: "Quality", pct: stats.score_breakdown.quality_share_pct, dot: "#FB923C" },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2 text-[12px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: row.dot }} />
                    <span className="font-semibold text-ink">{row.label}</span>
                    <span className="ml-auto font-bold text-ink-soft tabular-nums">{row.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </StatCard>

          {/* Score Decay */}
          <StatCard label="Score Decay">
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                <MiniSparkline pct={stats?.score_decay.pct ?? null} />
              </div>
              <div>
                <p className={`text-[24px] font-bold tabular-nums leading-none ${
                  stats?.score_decay.pct == null
                    ? "text-ink-muted"
                    : stats.score_decay.pct < 0
                    ? "text-orange-500"
                    : "text-emerald-600"
                }`}>
                  {stats?.score_decay.pct == null
                    ? "—"
                    : `${stats.score_decay.pct > 0 ? "+" : ""}${stats.score_decay.pct}%`}
                </p>
                <p className="text-[11px] text-ink-muted mt-1">
                  {stats?.score_decay.window_days
                    ? `In last ${stats.score_decay.window_days} days`
                    : "Need 14+ days of leads"}
                </p>
              </div>
            </div>
          </StatCard>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-slate-500 font-medium">Page <span className="font-bold text-slate-700 tabular-nums">{page}</span> of <span className="tabular-nums">{pages}</span></span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="h-9 px-4 rounded-full glass-1 border border-white/70 text-[12px] font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-40 transition-all"
            >← Previous</button>
            <button
              disabled={page >= pages}
              onClick={() => setPage(p => p + 1)}
              className="h-9 px-4 rounded-full glass-1 border border-white/70 text-[12px] font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-40 transition-all"
            >Next →</button>
          </div>
        </div>
      )}

      {/* ── Lead slide-over ───────────────────────────────────────────────── */}
      {selectedId && (
        <LeadSlideOver leadId={selectedId} onClose={() => setSelectedId(null)} />
      )}

    </div>
  )
}
