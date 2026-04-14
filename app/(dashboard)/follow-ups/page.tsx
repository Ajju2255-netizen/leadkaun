"use client"

import { useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { Phone, MessageCircle, CheckCircle2, SkipForward } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { LogCallModal } from "@/components/queue/LogCallModal"
import { LogWhatsAppModal } from "@/components/queue/LogWhatsAppModal"

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

function overdueLabel(dueDate: string): string {
  const diffMs = Date.now() - new Date(dueDate).getTime()
  if (diffMs <= 0) {
    const minsLeft = Math.round(-diffMs / 60_000)
    if (minsLeft < 60) return `Due in ${minsLeft}m`
    return `Due in ${Math.floor(minsLeft / 60)}h`
  }
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1)  return "Overdue < 1h"
  if (hours < 24) return `Overdue by ${hours}h`
  return `Overdue by ${Math.floor(hours / 24)}d`
}

function escalationBadge(count: number, isOverdue: boolean): { label: string; cls: string } | null {
  if (!isOverdue && count === 0) return null
  if (count >= 2) return { label: "🚨 High risk — may lose deal",  cls: "text-red-700 bg-red-50 border-red-200"   }
  if (count === 1) return { label: "⚠️ Getting cold",              cls: "text-amber-700 bg-amber-50 border-amber-200" }
  return null
}

// Sort: overdue first, then grade A→F, then value desc
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

async function fetchTeam(): Promise<{ members: { id: string; first_name: string; last_name: string }[] }> {
  const res = await fetch("/api/team/members", { credentials: "include" })
  if (!res.ok) return { members: [] }
  return res.json()
}

// ── Follow-up Card ────────────────────────────────────────────────────────────

function FollowUpCard({
  action,
  onComplete,
  onSkip,
}: {
  action:     FollowUpAction
  onComplete: (id: string) => void
  onSkip:     (id: string) => void
}) {
  const [callOpen, setCallOpen]   = useState(false)
  const [waOpen, setWaOpen]       = useState(false)
  const queryClient               = useQueryClient()
  const isOverdue                 = action.status === "OVERDUE"
  const fullName                  = [action.lead.first_name, action.lead.last_name].filter(Boolean).join(" ")
  const escalation                = escalationBadge(action.escalation_count, isOverdue)

  function handleModalClose() {
    setCallOpen(false)
    setWaOpen(false)
    // Mark follow-up complete after logging a signal
    onComplete(action.id)
    queryClient.invalidateQueries({ queryKey: ["queue"] })
    queryClient.invalidateQueries({ queryKey: ["pipeline"] })
  }

  return (
    <>
      <div className={`rounded-xl bg-white border shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4 space-y-3 ${
        isOverdue ? "border-red-100 border-l-[3px] border-l-red-500" : "border-slate-100"
      }`}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <GradeBadge grade={action.lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="md" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/leads/${action.lead.id}`}
                className="text-[13px] font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate block"
              >
                {fullName}
              </Link>
              {action.lead.company_name && (
                <p className="text-[12px] text-slate-400 truncate mt-0.5">{action.lead.company_name}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {action.lead.expected_value ? (
              <span className="text-[14px] font-bold text-emerald-700 tabular-nums">
                {formatValue(action.lead.expected_value)}
              </span>
            ) : null}
            {/* Action type pill */}
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              action.action_type === "CALL"
                ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                : "text-green-700 bg-green-50 border-green-200"
            }`}>
              {action.action_type === "CALL" ? <Phone className="w-2.5 h-2.5" /> : <MessageCircle className="w-2.5 h-2.5" />}
              {action.action_type === "CALL" ? "Call" : "WhatsApp"}
            </span>
          </div>
        </div>

        {/* Reason */}
        {action.tip_text && (
          <p className="text-[12px] text-slate-500 italic">{action.tip_text}</p>
        )}

        {/* Escalation + overdue time */}
        <div className="flex items-center gap-2 flex-wrap">
          {escalation && (
            <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${escalation.cls}`}>
              {escalation.label}
            </span>
          )}
          <span className={`text-[11px] font-medium ${isOverdue ? "text-red-600" : "text-slate-400"}`}>
            {overdueLabel(action.due_date)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCallOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold py-2 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
            Call
          </button>
          <button
            onClick={() => setWaOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[12px] font-semibold py-2 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
            Message
          </button>
          <button
            onClick={() => onComplete(action.id)}
            className="flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors p-2"
            title="Mark done"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSkip(action.id)}
            className="flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors p-2"
            title="Snooze 24h"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      <LogCallModal
        open={callOpen}
        onClose={handleModalClose}
        leadId={action.lead.id}
        leadName={fullName}
      />
      <LogWhatsAppModal
        open={waOpen}
        onClose={handleModalClose}
        leadId={action.lead.id}
        leadName={fullName}
      />
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FollowUpsPage() {
  const { data: session } = useCurrentUser()
  const isManager         = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"
  const queryClient       = useQueryClient()

  const [repFilter, setRepFilter] = useState("all")

  const { data, isLoading } = useQuery({
    queryKey:        ["follow-ups", repFilter],
    queryFn:         () => fetchFollowUps(repFilter === "all" ? undefined : repFilter),
    refetchInterval: 30_000,
  })

  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  fetchTeam,
    enabled:  isManager,
  })

  const complete = useCallback(async (id: string) => {
    const res = await fetch(`/api/follow-ups/${id}/complete`, { method: "POST", credentials: "include" })
    if (res.ok) {
      toast.success("Follow-up marked complete")
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
    } else {
      toast.error("Failed to complete")
    }
  }, [queryClient])

  const skip = useCallback(async (id: string) => {
    const res = await fetch(`/api/follow-ups/${id}/skip`, { method: "POST", credentials: "include" })
    if (res.ok) {
      toast.success("Snoozed 24 hours")
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
    } else {
      toast.error("Failed to skip")
    }
  }, [queryClient])

  const allActions = data?.actions ?? []
  const sorted     = sortActions(allActions)
  const overdue    = sorted.filter((a) => a.status === "OVERDUE")
  const pending    = sorted.filter((a) => a.status === "PENDING")

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Follow-ups</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {isLoading
              ? "Loading…"
              : `${allActions.length} due today${overdue.length > 0 ? ` · ${overdue.length} overdue` : ""}`}
          </p>
        </div>

        {isManager && teamData && teamData.members.length > 0 && (
          <Select value={repFilter} onValueChange={(v) => setRepFilter(v ?? "all")}>
            <SelectTrigger className="w-44 h-8 text-[12px]">
              <SelectValue placeholder="All reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {teamData.members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Overdue urgency banner */}
      {!isLoading && overdue.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="text-[18px] mt-0.5">🚨</span>
            <div>
              <p className="text-[14px] font-bold text-red-900">
                {overdue.length} follow-up{overdue.length > 1 ? "s" : ""} overdue
              </p>
              <p className="text-[12px] text-red-700 opacity-80">
                Every hour of delay reduces close probability — act now
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[180px] w-full rounded-xl" />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allActions.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-100 shadow-sm px-6 py-12 text-center">
          <div className="text-[32px] mb-3">✅</div>
          <p className="text-[14px] font-semibold text-slate-700">All caught up</p>
          <p className="text-[12px] text-slate-400 mt-1">No follow-ups due right now.</p>
        </div>
      )}

      {/* Overdue section */}
      {!isLoading && overdue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-red-600">Overdue</h2>
            <span className="inline-flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] px-1">
              {overdue.length}
            </span>
          </div>
          {overdue.map((action) => (
            <FollowUpCard key={action.id} action={action} onComplete={complete} onSkip={skip} />
          ))}
        </div>
      )}

      {/* Pending section */}
      {!isLoading && pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-semibold text-slate-700">Due Today</h2>
          {pending.map((action) => (
            <FollowUpCard key={action.id} action={action} onComplete={complete} onSkip={skip} />
          ))}
        </div>
      )}

    </div>
  )
}
