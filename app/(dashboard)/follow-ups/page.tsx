"use client"

import { useState, useCallback, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Phone, MessageCircle, Check, Clock3, X, CalendarCheck,
  AlertTriangle, CalendarClock, IndianRupee, CheckCircle2, Gauge,
  type LucideIcon,
} from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { cn } from "@/lib/utils"
import Link from "next/link"

// ── Types ─────────────────────────────────────────────────────────────────────

interface FollowUpAction {
  id:               string
  action_type:      string
  status:           string
  due_date:         string
  tip_text:         string | null
  escalation_count: number
  lead: {
    id:             string
    first_name:     string
    last_name:      string | null
    grade:          string
    company_name:   string | null
    phone:          string
    expected_value: number | null
  }
}

interface EngineData {
  score:               number | null
  completed_this_week: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

function overdueLabel(dueDate: string): { text: string; isOverdue: boolean; urgent: boolean } {
  const diffMs = Date.now() - new Date(dueDate).getTime()
  if (diffMs <= 0) {
    const minsLeft = Math.round(-diffMs / 60_000)
    if (minsLeft < 60) return { text: `Due in ${minsLeft}m`, isOverdue: false, urgent: minsLeft < 30 }
    return { text: `Due in ${Math.floor(minsLeft / 60)}h`, isOverdue: false, urgent: false }
  }
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1)  return { text: "Overdue < 1h",                   isOverdue: true, urgent: true  }
  if (hours < 24) return { text: `Overdue ${hours}h`,              isOverdue: true, urgent: hours < 4 }
  return            { text: `Overdue ${Math.floor(hours / 24)}d`,  isOverdue: true, urgent: false }
}

const CHANNEL_LABEL: Record<string, string> = {
  CALL: "Call", WHATSAPP: "WhatsApp", EMAIL: "Email", SMS: "SMS", MEETING: "Meeting",
}
function taskLabel(action: FollowUpAction): string {
  const tip = action.tip_text?.trim()
  if (tip) return tip
  const ch = CHANNEL_LABEL[action.action_type] ?? (action.action_type.charAt(0) + action.action_type.slice(1).toLowerCase())
  return `${ch} follow-up`
}

function sortActions(actions: FollowUpAction[]): FollowUpAction[] {
  const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 }
  return [...actions].sort((a, b) => {
    const aOver = a.status === "OVERDUE" ? 0 : 1
    const bOver = b.status === "OVERDUE" ? 0 : 1
    if (aOver !== bOver) return aOver - bOver
    const gA = GRADE_ORDER[a.lead.grade] ?? 9
    const gB = GRADE_ORDER[b.lead.grade] ?? 9
    if (gA !== gB) return gA - gB
    return (b.lead.expected_value ?? 0) - (a.lead.expected_value ?? 0)
  })
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchFollowUps(repId?: string): Promise<{ actions: FollowUpAction[]; total: number }> {
  const qs  = repId ? `?rep_id=${repId}` : ""
  const res = await fetch(`/api/follow-ups${qs}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch follow-ups")
  return res.json()
}

async function fetchEngine(repId?: string): Promise<EngineData> {
  const qs  = repId ? `?rep_id=${repId}` : ""
  const res = await fetch(`/api/follow-ups/engine${qs}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch engine")
  return res.json()
}

async function fetchTeam(): Promise<{ members: { id: string; first_name: string; last_name: string }[] }> {
  const res = await fetch("/api/team/members", { credentials: "include" })
  if (!res.ok) return { members: [] }
  return res.json()
}

// Shared column template: grade · lead · task · due · value · actions.
// Columns drop responsively (task on <lg, due on <sm) so the row stays full
// without a dead gap, and the header aligns to the rows.
const FU_GRID =
  "grid items-center gap-3 lg:gap-4 " +
  "grid-cols-[32px_minmax(0,1fr)_84px_148px] " +
  "sm:grid-cols-[32px_minmax(0,1fr)_118px_84px_148px] " +
  "lg:grid-cols-[32px_minmax(0,1.4fr)_minmax(0,1.4fr)_118px_84px_148px]"

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, tintBg, tintFg, caption }: {
  icon: LucideIcon
  label: string
  value: ReactNode
  tintBg: string
  tintFg: string
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
        {caption && <span className="text-[11.5px] text-ink-muted truncate">{caption}</span>}
      </div>
    </div>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────────

function FollowUpRow({ action, onOpen, onComplete, onSkip }: {
  action:     FollowUpAction
  onOpen:     (leadId: string) => void
  onComplete: (id: string) => void
  onSkip:     (action: FollowUpAction) => void
}) {
  const fullName = [action.lead.first_name, action.lead.last_name].filter(Boolean).join(" ")
  const due      = overdueLabel(action.due_date)
  const num      = action.lead.phone.replace(/[^0-9]/g, "")

  const dueTone = due.isOverdue
    ? "bg-rose-50 text-rose-600"
    : due.urgent
      ? "bg-amber-50 text-amber-600"
      : "bg-sky-50 text-sky-600"

  return (
    <div className={cn("group px-4 py-3 transition-colors hover:bg-slate-50/70", FU_GRID)}>
      {/* grade */}
      <div className="flex justify-center">
        <GradeBadge grade={action.lead.grade} size="sm" />
      </div>

      {/* lead — opens full detail */}
      <button onClick={() => onOpen(action.lead.id)} className="min-w-0 text-left">
        <p className="text-[13.5px] font-semibold text-ink truncate leading-tight group-hover:text-sky-700 transition-colors">{fullName}</p>
        <p className="text-[12px] text-ink-muted truncate leading-tight mt-0.5">{action.lead.company_name ?? "—"}</p>
      </button>

      {/* task */}
      <p className="hidden lg:block text-[12.5px] text-ink-soft truncate">{taskLabel(action)}</p>

      {/* due */}
      <div className="hidden sm:block">
        <span className={cn("inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap", dueTone)}>
          {due.text}
        </span>
      </div>

      {/* value */}
      <span className="text-right text-[13px] font-semibold text-ink-muted tabular-nums">
        {action.lead.expected_value ? formatValue(action.lead.expected_value) : "—"}
      </span>

      {/* actions */}
      <div className="flex items-center justify-end gap-0.5">
        <a href={`tel:${action.lead.phone}`} title="Call" className="w-8 h-8 rounded-lg flex items-center justify-center text-sky-600 hover:bg-sky-50 transition-colors">
          <Phone className="w-4 h-4" strokeWidth={2.25} />
        </a>
        {num && (
          <a href={`https://wa.me/${num}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors">
            <MessageCircle className="w-4 h-4" strokeWidth={2.25} />
          </a>
        )}
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <button onClick={() => onComplete(action.id)} title="Mark done" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all">
          <Check className="w-4 h-4" strokeWidth={2.5} />
        </button>
        <button onClick={() => onSkip(action)} title="Snooze 24h" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all">
          <Clock3 className="w-4 h-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FollowUpsPage() {
  const { data: session } = useCurrentUser()
  const isManager         = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"
  const queryClient       = useQueryClient()

  const [repFilter,  setRepFilter]  = useState("all")
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [skipTarget, setSkipTarget] = useState<FollowUpAction | null>(null)
  const [skipReason, setSkipReason] = useState("")
  const [skipping,   setSkipping]   = useState(false)

  const { data, isLoading } = useQuery({
    queryKey:        ["follow-ups", repFilter],
    queryFn:         () => fetchFollowUps(repFilter === "all" ? undefined : repFilter),
    refetchInterval: 30_000,
  })
  const { data: engine } = useQuery({
    queryKey:        ["follow-ups-engine", repFilter],
    queryFn:         () => fetchEngine(repFilter === "all" ? undefined : repFilter),
    refetchInterval: 60_000,
  })
  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  fetchTeam,
    enabled:  isManager,
  })

  const complete = useCallback(async (id: string) => {
    const res = await fetch(`/api/follow-ups/${id}/complete`, { method: "POST", credentials: "include" })
    if (res.ok) {
      toast.success("Follow-up done")
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      queryClient.invalidateQueries({ queryKey: ["follow-ups-engine"] })
    } else toast.error("Failed to complete")
  }, [queryClient])

  const skip = useCallback(async (id: string) => {
    const res = await fetch(`/api/follow-ups/${id}/skip`, { method: "POST", credentials: "include" })
    if (res.ok) {
      toast.success("Snoozed 24 hours")
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      queryClient.invalidateQueries({ queryKey: ["follow-ups-engine"] })
    } else toast.error("Failed to snooze")
  }, [queryClient])

  async function handleSkipConfirm() {
    if (!skipTarget || skipReason.trim().length < 3) return
    setSkipping(true)
    await skip(skipTarget.id)
    setSkipTarget(null); setSkipReason(""); setSkipping(false)
  }

  const allActions = data?.actions ?? []
  const sorted     = sortActions(allActions)
  const overdue    = sorted.filter((a) => a.status === "OVERDUE")
  const pending    = sorted.filter((a) => a.status !== "OVERDUE")
  const score      = engine?.score
  const atRisk     = overdue.reduce((s, a) => s + (a.lead.expected_value ?? 0), 0)

  return (
    <div className="flex flex-col gap-5 min-w-0 pb-10">

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 data-tour="followups.list" className="text-[24px] font-semibold text-ink tracking-[-0.02em] leading-tight">Follow-ups</h1>
          <p className="text-[13px] text-ink-muted mt-1">Work top to bottom — overdue first.</p>
        </div>
        {isManager && teamData && teamData.members.length > 0 && (
          <ThemedSelect
            variant="pill"
            value={repFilter}
            onValueChange={setRepFilter}
            options={[{ value: "all", label: "All reps" }, ...teamData.members.map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name ?? ""}`.trim() }))]}
            className="max-w-[160px]"
            aria-label="Filter by rep"
          />
        )}
      </header>

      {/* ── QUICK STATS ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold text-ink mb-3.5">Quick stats</h2>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatCard icon={AlertTriangle} label="Overdue"        value={overdue.length}                     tintBg="bg-rose-50"    tintFg="text-rose-500"    caption="need action now" />
            <StatCard icon={CalendarClock} label="Due today"      value={pending.length}                     tintBg="bg-sky-50"     tintFg="text-sky-600"     caption="on schedule" />
            <StatCard icon={IndianRupee}   label="At risk"        value={formatValue(atRisk)}                tintBg="bg-amber-50"   tintFg="text-amber-500"   caption="overdue value" />
            <StatCard icon={CheckCircle2}  label="Done this week" value={engine?.completed_this_week ?? 0}   tintBg="bg-emerald-50" tintFg="text-emerald-600" caption="completed" />
            <StatCard icon={Gauge}         label="Follow-up score" value={score != null ? `${score}%` : "—"} tintBg="bg-violet-50"  tintFg="text-violet-500"  caption="consistency" />
          </div>
        )}
      </section>

      {/* ── LOADING ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="rounded-2xl border border-slate-200/70 bg-white overflow-hidden divide-y divide-slate-100">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-4 py-3"><Skeleton className="h-9 w-full rounded-lg" /></div>
          ))}
        </div>
      )}

      {/* ── EMPTY ─────────────────────────────────────────────────────── */}
      {!isLoading && allActions.length === 0 && (
        <div className="rounded-2xl border border-slate-200/70 bg-white">
          <EmptyState
            icon={CalendarCheck}
            title="All caught up"
            description="No follow-ups due. Schedule new ones from the queue."
            action={
              <Link href="/queue" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold transition-colors">
                Work the queue
              </Link>
            }
            className="py-16"
          />
        </div>
      )}

      {/* ── FOLLOW-UP TABLE ───────────────────────────────────────────── */}
      {!isLoading && allActions.length > 0 && (
        <div className="rounded-2xl border border-slate-200/70 bg-white overflow-hidden">
          {/* column header */}
          <div className={cn(FU_GRID, "px-4 py-2.5 border-b border-slate-100 bg-slate-50/50")}>
            <span aria-hidden />
            <span className="text-[12px] font-semibold text-ink-soft">Lead</span>
            <span className="hidden lg:block text-[12px] font-semibold text-ink-soft">Task</span>
            <span className="hidden sm:block text-[12px] font-semibold text-ink-soft">Due</span>
            <span className="text-[12px] font-semibold text-ink-soft text-right">Value</span>
            <span aria-hidden />
          </div>

          {/* One continuous list — sorted overdue-first; each row's Due pill colour
              (rose = overdue, sky = upcoming) marks status. Counts live in Quick stats. */}
          <div className="divide-y divide-slate-100">
            {sorted.map((a) => (
              <FollowUpRow key={a.id} action={a} onOpen={setOpenLeadId} onComplete={complete} onSkip={setSkipTarget} />
            ))}
          </div>
        </div>
      )}

      {/* Lead detail */}
      {openLeadId && <LeadSlideOver leadId={openLeadId} onClose={() => setOpenLeadId(null)} />}

      {/* Snooze reason modal */}
      {skipTarget && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white ring-1 ring-slate-900/5 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-[16px] font-bold text-slate-900">Snooze 24 hours?</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {[skipTarget.lead.first_name, skipTarget.lead.last_name].filter(Boolean).join(" ")}
                </p>
              </div>
              <button onClick={() => { setSkipTarget(null); setSkipReason("") }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                type="text"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSkipConfirm()}
                placeholder="Why? e.g. asked to call back tomorrow"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900
                           placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all"
              />
              <div className="flex gap-2">
                <button onClick={() => { setSkipTarget(null); setSkipReason("") }}
                  className="flex-1 h-9 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleSkipConfirm} disabled={skipReason.trim().length < 3 || skipping}
                  className="flex-1 h-9 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {skipping ? "Snoozing…" : "Snooze 24h"}
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
