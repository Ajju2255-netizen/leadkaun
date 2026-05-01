"use client"

import { useState, useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import {
  Phone, MessageCircle, CheckCircle2, SkipForward,
  Clock, AlertTriangle, ArrowUpRight, X, CalendarCheck,
  Zap, TrendingUp, Users, Target, Mail, CheckCircle,
  AlertCircle, ChevronRight, Sparkles,
} from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
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

interface EngineDay {
  date:    string
  weekday: string
  status:  "done" | "missed" | "today" | "future" | "empty"
}

interface EngineActivity {
  id:           string
  lead_id:      string
  lead_name:    string
  action_type:  string
  status:       string
  due_date:     string
  completed_at: string | null
}

interface EngineUpcoming {
  id:          string
  lead_id:     string
  lead_name:   string
  grade:       string
  action_type: string
  due_date:    string
}

interface EngineData {
  score:               number
  completed_this_week: number
  overdue_open:        number
  active_leads:        number
  new_this_week:       number
  week_consistency:    EngineDay[]
  recent_activity:     EngineActivity[]
  upcoming_7d:         EngineUpcoming[]
  now:                 string
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
  if (hours < 1)  return { text: "Overdue < 1h",                    isOverdue: true, urgent: true  }
  if (hours < 24) return { text: `Overdue ${hours}h`,               isOverdue: true, urgent: hours < 4 }
  return             { text: `Overdue ${Math.floor(hours / 24)}d`,  isOverdue: true, urgent: false }
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

function scoreLabel(s: number): { word: string; tone: "mint" | "sky" | "peach" | "rose" } {
  if (s >= 85) return { word: "Excellent", tone: "mint" }
  if (s >= 70) return { word: "Strong",    tone: "sky"  }
  if (s >= 50) return { word: "Building",  tone: "peach" }
  return         { word: "Slipping",  tone: "rose" }
}

function timeShort(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
}

function relativeWhen(iso: string): string {
  const d  = new Date(iso)
  const t  = new Date(); t.setHours(0, 0, 0, 0)
  const dt = new Date(d); dt.setHours(0, 0, 0, 0)
  const diff = (dt.getTime() - t.getTime()) / 86_400_000
  if (diff < 0)  return diff <= -1.5 ? `${Math.round(-diff)}d ago` : "Yesterday"
  if (diff < 1)  return `Today, ${timeShort(iso)}`
  if (diff < 2)  return `Tomorrow, ${timeShort(iso)}`
  return d.toLocaleDateString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })
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

// ── Score Donut ───────────────────────────────────────────────────────────────

function ScoreDonut({ value }: { value: number }) {
  const r = 56
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100)
  const tone = scoreLabel(value).tone
  const ringColor = {
    mint:  "#10B981",
    sky:   "#0EA5E9",
    peach: "#FB923C",
    rose:  "#F43F5E",
  }[tone]

  return (
    <div className="relative w-[140px] h-[140px]">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="score-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor={ringColor} stopOpacity="1"   />
            <stop offset="100%" stopColor={ringColor} stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(15,23,42,0.06)" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r}
          fill="none" stroke="url(#score-grad)" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[28px] font-extrabold tabular-nums leading-none text-slate-900">{value}<span className="text-[18px] text-slate-400">%</span></p>
        <p className={`text-[11px] font-bold mt-1 tracking-wide uppercase ${
          tone === "mint"  ? "text-emerald-600" :
          tone === "sky"   ? "text-sky-600"     :
          tone === "peach" ? "text-orange-600"  :
                              "text-rose-600"
        }`}>{scoreLabel(value).word}</p>
      </div>
    </div>
  )
}

// ── Sequence Funnel ───────────────────────────────────────────────────────────

function SequenceFunnel({ engine }: { engine: EngineData | undefined }) {
  // Derive a "today's sequence" from the most recent activity stream.
  // Steps: Call → WhatsApp → Email → Follow-up → Close
  // We mark Call/WhatsApp done if rep completed any of those today; Email is
  // informational; Follow-up reflects the next pending; Close reflects whether
  // any won/lost happened (we don't have that here so "Not done" is fine).
  const steps = useMemo(() => {
    const completedToday = engine?.recent_activity.filter(a => a.status === "COMPLETED" && a.completed_at) ?? []
    const callDone = completedToday.some(a => a.action_type === "CALL")
    const waDone   = completedToday.some(a => a.action_type === "WHATSAPP")
    const nextPending = engine?.recent_activity.find(a => a.status === "PENDING" || a.status === "OVERDUE")
    return [
      { key: "call",     label: "Call",      icon: Phone,         status: callDone ? "done" : (nextPending?.action_type === "CALL" ? "pending" : "future") },
      { key: "whatsapp", label: "WhatsApp",  icon: MessageCircle, status: waDone   ? "done" : (nextPending?.action_type === "WHATSAPP" ? "pending" : "future") },
      { key: "email",    label: "Email",     icon: Mail,          status: "future" as const },
      { key: "followup", label: "Follow-up", icon: Clock,         status: nextPending ? "pending" : (callDone || waDone ? "done" : "future") },
      { key: "close",    label: "Close",     icon: Target,        status: "missed" as const },
    ]
  }, [engine])

  const nextActionText = useMemo(() => {
    if (!engine) return null
    const nextPending = engine.recent_activity.find(a => (a.status === "PENDING" || a.status === "OVERDUE"))
    if (!nextPending) return null
    return nextPending.status === "OVERDUE"
      ? `Overdue · ${nextPending.lead_name}`
      : `${nextPending.action_type === "CALL" ? "Call" : "Message"} ${nextPending.lead_name} · ${overdueLabel(nextPending.due_date).text}`
  }, [engine])

  const PILL: Record<string, { bg: string; ring: string; icon: string; label: string }> = {
    done:    { bg: "bg-gradient-to-br from-emerald-400 to-emerald-500", ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_4px_10px_rgba(16,185,129,0.30)]", icon: "text-white", label: "text-emerald-600" },
    pending: { bg: "bg-gradient-to-br from-orange-300 to-orange-400",   ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_4px_10px_rgba(251,146,60,0.30)]", icon: "text-white", label: "text-orange-600"  },
    future:  { bg: "bg-gradient-to-br from-sky-200 to-sky-300",         ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",                                  icon: "text-white", label: "text-slate-400"   },
    missed:  { bg: "bg-rose-50",                                         ring: "shadow-[inset_0_0_0_1px_rgba(244,63,94,0.18)]",                                 icon: "text-rose-500", label: "text-rose-500" },
  }

  return (
    <div className="rounded-2xl glass-3 gloss-edge p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-bold text-slate-900">Today&apos;s sequence</p>
        <p className="text-[11px] text-slate-400 font-mono">Call → Close</p>
      </div>
      <div className="flex items-start justify-between gap-1">
        {steps.map((s, i) => {
          const p = PILL[s.status]
          const Icon = s.icon
          return (
            <div key={s.key} className="flex items-start gap-1 flex-1">
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${p.bg} ${p.ring}`}>
                  <Icon className={`w-5 h-5 ${p.icon}`} strokeWidth={2.4} />
                </div>
                <p className="text-[11px] font-semibold text-slate-700 leading-tight">{s.label}</p>
                <p className={`text-[10px] font-semibold ${p.label} leading-none -mt-1.5`}>
                  {s.status === "done" ? "Completed" : s.status === "pending" ? "Pending" : s.status === "missed" ? "Not done" : "Queued"}
                </p>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-300 mt-3.5 shrink-0" strokeWidth={2.5} />
              )}
            </div>
          )
        })}
      </div>
      {nextActionText && (
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          <Sparkles className="w-3 h-3 text-orange-500" />
          <span className="text-[11px] font-semibold text-orange-700">Next action · {nextActionText}</span>
        </div>
      )}
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ items }: { items: EngineActivity[] }) {
  const top = items.slice(0, 4)
  return (
    <div className="rounded-2xl glass-3 gloss-edge p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-bold text-slate-900">Recent activity</p>
        <p className="text-[11px] text-slate-400">Last 24h</p>
      </div>
      {top.length === 0 ? (
        <p className="text-[12px] text-slate-400 py-4 text-center">No activity yet today.</p>
      ) : (
        <div className="space-y-2">
          {top.map(a => {
            const isDone   = a.status === "COMPLETED"
            const isMissed = a.status === "OVERDUE"
            const conf = isDone
              ? { Icon: CheckCircle, tint: "bg-gradient-to-br from-emerald-400 to-emerald-500", glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_10px_rgba(16,185,129,0.25)]", title: "Follow-up completed", sub: `${a.action_type === "CALL" ? "Call" : "WhatsApp"} · ${a.lead_name}`, when: timeShort(a.completed_at) }
              : isMissed
                ? { Icon: AlertCircle, tint: "bg-gradient-to-br from-rose-400 to-rose-500", glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_10px_rgba(244,63,94,0.25)]", title: "Missed follow-up", sub: `${a.lead_name} (${overdueLabel(a.due_date).text})`, when: relativeWhen(a.due_date) }
                : { Icon: Clock, tint: "bg-gradient-to-br from-sky-400 to-sky-500", glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_10px_rgba(14,165,233,0.30)]", title: "Reminder", sub: `${a.action_type === "CALL" ? "Call" : "Message"} ${a.lead_name}`, when: timeShort(a.due_date) }
            return (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl glass-1 hover:bg-white/70 transition-colors">
                <div className={`w-8 h-8 rounded-full ${conf.tint} ${conf.glow} flex items-center justify-center shrink-0`}>
                  <conf.Icon className="w-4 h-4 text-white" strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-900 truncate leading-tight">{conf.title}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{conf.sub}</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">{conf.when}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── This Week's Consistency ───────────────────────────────────────────────────

function WeekConsistency({ days }: { days: EngineDay[] }) {
  const done    = days.filter(d => d.status === "done").length
  const missed  = days.filter(d => d.status === "missed").length
  const tracked = done + missed   // only days with expected work count
  const pct     = tracked > 0 ? Math.round((done / tracked) * 100) : null

  return (
    <div className="rounded-2xl glass-3 gloss-edge p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-bold text-slate-900">This week&apos;s consistency</p>
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">7-day</span>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1 grid grid-cols-7 gap-2">
          {days.map(d => {
            const cell = d.status === "done"
              ? { bg: "bg-gradient-to-br from-emerald-400 to-emerald-500", glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_3px_8px_rgba(16,185,129,0.25)]", icon: <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />, sub: "Done", subColor: "text-emerald-600" }
              : d.status === "missed"
                ? { bg: "bg-gradient-to-br from-rose-400 to-rose-500", glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_3px_8px_rgba(244,63,94,0.25)]", icon: <X className="w-3.5 h-3.5 text-white" strokeWidth={3} />, sub: "Missed", subColor: "text-rose-600" }
                : d.status === "today"
                  ? { bg: "bg-gradient-to-br from-sky-400 to-sky-500", glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_3px_8px_rgba(14,165,233,0.30)]", icon: <Clock className="w-3.5 h-3.5 text-white" strokeWidth={3} />, sub: "Today", subColor: "text-sky-600" }
                  : { bg: "bg-slate-50 border border-slate-100", glow: "", icon: <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />, sub: "—", subColor: "text-slate-300" }
            return (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{d.weekday}</p>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cell.bg} ${cell.glow}`}>{cell.icon}</div>
                <p className={`text-[9px] font-bold ${cell.subColor} leading-none`}>{cell.sub}</p>
              </div>
            )
          })}
        </div>
        <div className="rounded-xl px-4 py-3 bg-sky-50 border border-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] text-center min-w-[78px]">
          {pct !== null ? (
            <>
              <p className="text-[20px] font-extrabold text-sky-700 tabular-nums leading-none">{pct}<span className="text-[14px] text-sky-500">%</span></p>
              <p className="text-[10px] font-bold text-sky-600 mt-1 leading-none">Consistency</p>
            </>
          ) : (
            <>
              <p className="text-[18px] font-extrabold text-sky-700 leading-none">—</p>
              <p className="text-[10px] font-bold text-sky-600 mt-1 leading-none">No data yet</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Upcoming Follow-ups list ──────────────────────────────────────────────────

function UpcomingList({ items }: { items: EngineUpcoming[] }) {
  return (
    <div className="rounded-2xl glass-3 gloss-edge p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-bold text-slate-900">Upcoming follow-ups</p>
        <p className="text-[11px] text-slate-400">Next 7 days · {items.length}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-slate-400 py-6 text-center">Nothing scheduled in the next week.</p>
      ) : (
        <div className="space-y-2">
          {items.map(u => {
            const isCall = u.action_type === "CALL"
            const channel = isCall
              ? { Icon: Phone,         tint: "bg-gradient-to-br from-emerald-400 to-emerald-500", glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_3px_8px_rgba(16,185,129,0.25)]" }
              : { Icon: MessageCircle, tint: "bg-gradient-to-br from-sky-400 to-sky-500",         glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_3px_8px_rgba(14,165,233,0.25)]" }
            const priority = u.grade === "A" ? { word: "High", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
              : u.grade === "B" ? { word: "Medium", cls: "bg-orange-50 text-orange-700 border-orange-200" }
              : { word: "Low", cls: "bg-sky-50 text-sky-700 border-sky-200" }
            return (
              <Link
                key={u.id}
                href={`/leads/${u.lead_id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl glass-1 hover:bg-white/70 transition-colors group"
              >
                <div className={`w-8 h-8 rounded-full ${channel.tint} ${channel.glow} flex items-center justify-center shrink-0`}>
                  <channel.Icon className="w-4 h-4 text-white" strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-900 truncate leading-tight">{u.lead_name}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{isCall ? "Call" : "WhatsApp"}</p>
                </div>
                <p className="text-[11px] text-slate-500 font-medium shrink-0">{relativeWhen(u.due_date)}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priority.cls} shrink-0`}>
                  {priority.word}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Follow-up Card (re-skinned glass) ─────────────────────────────────────────

function FollowUpCard({
  action,
  onComplete,
  onSkipRequest,
}: {
  action:         FollowUpAction
  onComplete:     (id: string) => void
  onSkipRequest:  (action: FollowUpAction) => void
}) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen,   setWaOpen]   = useState(false)
  const queryClient             = useQueryClient()
  const isOverdue               = action.status === "OVERDUE"
  const fullName                = [action.lead.first_name, action.lead.last_name].filter(Boolean).join(" ")
  const due                     = overdueLabel(action.due_date)
  const isCall                  = action.action_type === "CALL"

  const escLevel = action.escalation_count >= 2 ? "high"
    : action.escalation_count === 1 || (isOverdue && due.urgent) ? "medium"
    : null

  function handleModalClose() {
    setCallOpen(false)
    setWaOpen(false)
    onComplete(action.id)
    queryClient.invalidateQueries({ queryKey: ["queue"] })
    queryClient.invalidateQueries({ queryKey: ["pipeline"] })
    queryClient.invalidateQueries({ queryKey: ["follow-ups-engine"] })
  }

  return (
    <>
      <div className={`
        rounded-2xl transition-all duration-200 hover:-translate-y-[1px] overflow-hidden
        ${isOverdue
          ? "bg-rose-50/30 backdrop-blur-md border border-rose-200/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_3px_rgba(244,63,94,0.06),0_8px_24px_rgba(244,63,94,0.10)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_4px_20px_rgba(244,63,94,0.14)]"
          : "glass-2 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_18px_rgba(15,23,42,0.08)]"
        }
      `}>
        {isOverdue && <div className="h-0.5 w-full bg-gradient-to-r from-rose-500 to-rose-400" />}
        <div className="px-4 pt-4 pb-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <GradeBadge grade={action.lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="md" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/leads/${action.lead.id}`}
                  className="text-[14px] font-bold text-slate-900 hover:text-sky-600 transition-colors truncate block leading-tight"
                >
                  {fullName}
                </Link>
                {action.lead.company_name && (
                  <p className="text-[12px] text-slate-400 truncate mt-0.5">{action.lead.company_name}</p>
                )}
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              {action.lead.expected_value ? (
                <span className="text-[16px] font-extrabold text-emerald-700 tabular-nums leading-none font-mono">
                  {formatValue(action.lead.expected_value)}
                </span>
              ) : null}
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ${
                isCall
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-sky-50 text-sky-700 border-sky-200"
              }`}>
                {isCall
                  ? <><Phone className="w-2.5 h-2.5" /> Call</>
                  : <><MessageCircle className="w-2.5 h-2.5" /> WhatsApp</>
                }
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ${
              due.isOverdue && due.urgent ? "bg-rose-100 text-rose-700 border-rose-200"
              : due.isOverdue            ? "bg-rose-50 text-rose-600 border-rose-200"
              : due.urgent               ? "bg-orange-50 text-orange-700 border-orange-200"
              : "bg-slate-50 text-slate-500 border-slate-200"
            }`}>
              <Clock className="w-2.5 h-2.5 shrink-0" />
              {due.text}
            </span>
            {escLevel === "high" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                High risk — may lose deal
              </span>
            )}
            {escLevel === "medium" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                Getting cold
              </span>
            )}
            {action.escalation_count >= 1 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                Snoozed {action.escalation_count}×
              </span>
            )}
          </div>

          {action.tip_text && (
            <p className="text-[12px] text-slate-500 leading-relaxed">{action.tip_text}</p>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 pb-4">
          <button
            onClick={() => setCallOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full
                       bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600
                       text-white text-[12px] font-semibold
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                       active:scale-[0.97] transition-all duration-150"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
            Call
          </button>
          <button
            onClick={() => setWaOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full
                       bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600
                       text-white text-[12px] font-semibold
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(16,185,129,0.30)]
                       active:scale-[0.97] transition-all duration-150"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
            Message
          </button>
          <Link
            href={`/leads/${action.lead.id}`}
            className="flex items-center justify-center w-9 h-9 rounded-full glass-1
                       text-slate-400 hover:text-slate-700 transition-all duration-150"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => onComplete(action.id)}
            title="Mark done"
            className="flex items-center justify-center w-9 h-9 rounded-full glass-1
                       text-slate-400 hover:text-emerald-600 active:scale-[0.97] transition-all duration-150"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSkipRequest(action)}
            title="Snooze 24h"
            className="flex items-center justify-center w-9 h-9 rounded-full glass-1
                       text-slate-400 hover:text-slate-600 active:scale-[0.97] transition-all duration-150"
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

  const [repFilter,   setRepFilter]   = useState("all")
  const [skipTarget,  setSkipTarget]  = useState<FollowUpAction | null>(null)
  const [skipReason,  setSkipReason]  = useState("")
  const [skipping,    setSkipping]    = useState(false)

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
      toast.success("Follow-up marked complete")
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      queryClient.invalidateQueries({ queryKey: ["follow-ups-engine"] })
    } else {
      toast.error("Failed to complete")
    }
  }, [queryClient])

  const skip = useCallback(async (id: string) => {
    const res = await fetch(`/api/follow-ups/${id}/skip`, { method: "POST", credentials: "include" })
    if (res.ok) {
      toast.success("Snoozed 24 hours")
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      queryClient.invalidateQueries({ queryKey: ["follow-ups-engine"] })
    } else {
      toast.error("Failed to skip")
    }
  }, [queryClient])

  async function handleSkipConfirm() {
    if (!skipTarget || skipReason.trim().length < 3) return
    setSkipping(true)
    await skip(skipTarget.id)
    setSkipTarget(null)
    setSkipReason("")
    setSkipping(false)
  }

  const allActions = data?.actions ?? []
  const sorted     = sortActions(allActions)
  const overdue    = sorted.filter((a) => a.status === "OVERDUE")
  const pending    = sorted.filter((a) => a.status === "PENDING")

  return (
    <div className="max-w-[1280px] mx-auto space-y-6 pb-12">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
            <Zap className="w-6 h-6 text-white" strokeWidth={2.4} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight">Follow-up Engine</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Consistency wins deals. The right follow-up, at the right time.
            </p>
          </div>
        </div>

        {isManager && teamData && teamData.members.length > 0 && (
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="h-9 pl-4 pr-8 rounded-full glass-1 text-[12px] font-semibold text-slate-700
                       focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400
                       appearance-none cursor-pointer transition-all"
          >
            <option value="all">All reps</option>
            {teamData.members.map((m) => (
              <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── KPI strip: Score · Active Leads · Week Consistency · Tip ──────── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Score donut card */}
        <div className="col-span-3 rounded-2xl glass-3 gloss-edge p-5 relative overflow-hidden">
          <div
            className="absolute -top-12 -right-10 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(110,231,183,0.55) 0%, rgba(110,231,183,0) 70%)" }}
          />
          <div className="flex items-center gap-2 mb-3 relative">
            <TrendingUp className="w-4 h-4 text-sky-500" strokeWidth={2.5} />
            <p className="text-[12px] font-bold text-slate-700">Follow-up score</p>
          </div>
          <div className="flex items-center justify-center relative">
            <ScoreDonut value={engine?.score ?? 0} />
          </div>
          <p className="text-[12px] font-semibold text-slate-700 text-center mt-2">You&apos;re doing great!</p>
          <p className="text-[11px] text-slate-400 text-center">Keep up the consistency.</p>
        </div>

        {/* Active leads tile */}
        <div className="col-span-3 rounded-2xl glass-3 gloss-edge p-5 relative overflow-hidden">
          <div
            className="absolute -top-12 -left-12 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(125,211,252,0.55) 0%, rgba(125,211,252,0) 70%)" }}
          />
          <div className="flex items-center gap-2 mb-3 relative">
            <Users className="w-4 h-4 text-sky-500" strokeWidth={2.5} />
            <p className="text-[12px] font-bold text-slate-700">Active leads</p>
          </div>
          <div className="relative">
            <p className="text-[44px] font-extrabold text-slate-900 tabular-nums leading-none font-mono">{engine?.active_leads ?? "—"}</p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <TrendingUp className="w-3 h-3 text-sky-600" strokeWidth={2.5} />
              <span className="text-[11px] font-bold text-sky-700 tabular-nums">+{engine?.new_this_week ?? 0} this week</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Open · not won, not lost.</p>
          </div>
        </div>

        {/* Week consistency tile */}
        <div className="col-span-4">
          <WeekConsistency days={engine?.week_consistency ?? Array.from({ length: 7 }, (_, i) => ({ date: String(i), weekday: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i], status: "empty" as const }))} />
        </div>

        {/* Stay consistent tip */}
        <div className="col-span-2 rounded-2xl glass-3 gloss-edge p-5 relative overflow-hidden">
          <div
            className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(253,186,116,0.55) 0%, rgba(253,186,116,0) 70%)" }}
          />
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-500 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_4px_10px_rgba(139,92,246,0.30)] mb-3 relative">
            <Target className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <p className="text-[12px] font-bold text-slate-900 leading-tight relative">Stay consistent</p>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5 relative">
            Leads engaged in <span className="font-bold text-slate-700">3+ follow-ups</span> are <span className="font-bold text-orange-600">4.7×</span> more likely to convert.
          </p>
        </div>
      </div>

      {/* ── Sequence funnel + Activity feed ──────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7">
          <SequenceFunnel engine={engine} />
        </div>
        <div className="col-span-5">
          <ActivityFeed items={engine?.recent_activity ?? []} />
        </div>
      </div>

      {/* ── Upcoming preview ─────────────────────────────────────────────── */}
      <UpcomingList items={engine?.upcoming_7d ?? []} />

      {/* ── Overdue urgency banner (glass) ───────────────────────────────── */}
      {!isLoading && overdue.length > 0 && (
        <div className="rounded-2xl glass-3 gloss-edge p-5 relative overflow-hidden">
          <div
            className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(253,164,175,0.45) 0%, rgba(253,164,175,0) 70%)" }}
          />
          <div className="flex items-center gap-3 relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-400 to-rose-500 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_18px_rgba(244,63,94,0.32)]">
              <AlertTriangle className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-slate-900">
                {overdue.length} follow-up{overdue.length > 1 ? "s" : ""} overdue
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Every hour of delay reduces close probability — act now.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!isLoading && allActions.length === 0 && (
        <div className="rounded-2xl glass-3 gloss-edge px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_18px_rgba(16,185,129,0.32)]">
            <CalendarCheck className="w-6 h-6 text-white" strokeWidth={2.4} />
          </div>
          <p className="text-[15px] font-bold text-slate-900">All caught up</p>
          <p className="text-[12px] text-slate-500 mt-1.5 max-w-[300px] mx-auto leading-relaxed">
            No follow-ups due today. Schedule new ones from the queue to keep momentum.
          </p>
          <Link
            href="/queue"
            className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-full
                       bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600
                       text-white text-[12px] font-semibold transition-all active:scale-[0.97]
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]"
          >
            <Phone className="w-3 h-3" strokeWidth={2.5} />
            Work the queue
          </Link>
        </div>
      )}

      {/* ── Overdue + Today action cards (2-col grid) ────────────────────── */}
      {!isLoading && (overdue.length > 0 || pending.length > 0) && (
        <div className="space-y-5">
          {overdue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Overdue</p>
                <span className="inline-flex items-center justify-center text-[10px] font-black bg-gradient-to-br from-rose-500 to-rose-600 text-white rounded-full min-w-[20px] h-[20px] px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                  {overdue.length}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-rose-200/60 to-transparent ml-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {overdue.map((action) => (
                  <FollowUpCard key={action.id} action={action} onComplete={complete} onSkipRequest={setSkipTarget} />
                ))}
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.15)]" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Due today · {pending.length}</p>
                <div className="flex-1 h-px bg-gradient-to-r from-sky-200/60 to-transparent ml-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {pending.map((action) => (
                  <FollowUpCard key={action.id} action={action} onComplete={complete} onSkipRequest={setSkipTarget} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Skip reason modal (glass-3) ──────────────────────────────────── */}
      {skipTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl glass-3 gloss-edge overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/30">
              <div>
                <p className="text-[15px] font-bold text-slate-900">Why are you snoozing this?</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {[skipTarget.lead.first_name, skipTarget.lead.last_name].filter(Boolean).join(" ")}
                </p>
              </div>
              <button
                onClick={() => { setSkipTarget(null); setSkipReason("") }}
                className="w-8 h-8 rounded-full glass-1 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                type="text"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSkipConfirm()}
                placeholder="e.g. Lead asked to call back tomorrow"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900
                           placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                           focus:border-sky-400 transition-all"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setSkipTarget(null); setSkipReason("") }}
                  className="flex-1 h-9 rounded-full glass-1 text-[13px] font-semibold text-slate-600 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSkipConfirm}
                  disabled={skipReason.trim().length < 3 || skipping}
                  className="flex-1 h-9 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 text-white text-[13px]
                             font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all
                             shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]"
                >
                  {skipping ? "Snoozing…" : "Snooze 24h"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
