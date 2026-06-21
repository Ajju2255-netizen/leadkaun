"use client"

import { useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Phone, MessageCircle, Check, Clock3, X, CalendarCheck } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { LeadSlideOver } from "@/components/shared/LeadSlideOver"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
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

  return (
    <div className="group flex items-center gap-3 px-3.5 py-2.5 hover:bg-sky-50/40 transition-colors">
      {/* identity — opens full detail */}
      <button onClick={() => onOpen(action.lead.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
        <GradeBadge grade={action.lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="sm" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-900 truncate leading-tight group-hover:text-sky-700 transition-colors">{fullName}</p>
          <p className="text-[11px] truncate leading-tight mt-0.5">
            <span className="text-slate-400">{action.lead.company_name ?? "—"}</span>
            <span className="text-slate-300"> · </span>
            <span className={due.isOverdue ? "text-rose-500 font-semibold" : due.urgent ? "text-orange-500 font-semibold" : "text-slate-400"}>{due.text}</span>
          </p>
        </div>
      </button>

      {/* value */}
      {action.lead.expected_value ? (
        <span className="hidden sm:block text-[13px] font-bold text-slate-700 tabular-nums shrink-0">
          {formatValue(action.lead.expected_value)}
        </span>
      ) : null}

      {/* actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <a href={`tel:${action.lead.phone}`} title="Call" className="w-8 h-8 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-100 transition-colors">
          <Phone className="w-4 h-4" strokeWidth={2.25} />
        </a>
        {num && (
          <a href={`https://wa.me/${num}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="w-8 h-8 rounded-full flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-colors">
            <MessageCircle className="w-4 h-4" strokeWidth={2.25} />
          </a>
        )}
        <span className="w-px h-5 bg-slate-200 mx-0.5" />
        <button onClick={() => onComplete(action.id)} title="Mark done" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all">
          <Check className="w-4 h-4" strokeWidth={2.5} />
        </button>
        <button onClick={() => onSkip(action)} title="Snooze 24h" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all">
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

  return (
    <div className="max-w-[760px] mx-auto space-y-5 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Follow-ups</h1>
          <p className="text-[12px] text-slate-500 mt-1.5">Work top to bottom — overdue first.</p>
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
      </div>

      {/* Slim summary line */}
      <div className="flex items-center flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-500">
        <span><span className="font-extrabold text-rose-600 tabular-nums">{isLoading ? "—" : overdue.length}</span> overdue</span>
        <span><span className="font-extrabold text-sky-600 tabular-nums">{isLoading ? "—" : pending.length}</span> due today</span>
        <span><span className="font-extrabold text-emerald-600 tabular-nums">{engine?.completed_this_week ?? 0}</span> done this week</span>
        <span className="sm:ml-auto text-slate-400">
          Follow-up score <span className="font-extrabold text-slate-700 tabular-nums">{score != null ? `${score}%` : "—"}</span>
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="rounded-2xl glass-2 gloss-edge overflow-hidden divide-y divide-slate-100/70">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-none" />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && allActions.length === 0 && (
        <div className="rounded-2xl glass-2 gloss-edge px-6 py-14 text-center">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_16px_rgba(16,185,129,0.30)]">
            <CalendarCheck className="w-5 h-5 text-white" strokeWidth={2.4} />
          </div>
          <p className="text-[14px] font-bold text-slate-900">All caught up</p>
          <p className="text-[12px] text-slate-500 mt-1">No follow-ups due. Schedule new ones from the queue.</p>
          <Link href="/queue" className="inline-flex items-center gap-1.5 mt-4 h-8 px-4 rounded-full text-white text-[12px] font-semibold
                       bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 transition-all active:scale-[0.97]
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]">
            Work the queue
          </Link>
        </div>
      )}

      {/* Overdue list */}
      {!isLoading && overdue.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-rose-600">Overdue · {overdue.length}</p>
          </div>
          <div className="rounded-2xl glass-2 gloss-edge overflow-hidden divide-y divide-slate-100/70">
            {overdue.map((a) => (
              <FollowUpRow key={a.id} action={a} onOpen={setOpenLeadId} onComplete={complete} onSkip={setSkipTarget} />
            ))}
          </div>
        </section>
      )}

      {/* Due today list */}
      {!isLoading && pending.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-600">Due today · {pending.length}</p>
          </div>
          <div className="rounded-2xl glass-2 gloss-edge overflow-hidden divide-y divide-slate-100/70">
            {pending.map((a) => (
              <FollowUpRow key={a.id} action={a} onOpen={setOpenLeadId} onComplete={complete} onSkip={setSkipTarget} />
            ))}
          </div>
        </section>
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
                  className="flex-1 h-9 rounded-full border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleSkipConfirm} disabled={skipReason.trim().length < 3 || skipping}
                  className="flex-1 h-9 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 text-white text-[13px]
                             font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all
                             shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]">
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
