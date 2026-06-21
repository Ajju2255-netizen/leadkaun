"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import Link from "next/link"
import {
  Phone, MessageCircle, Trophy, X, MoreHorizontal,
  MapPin, Building2, Briefcase, Clock, Zap, ChevronLeft,
  PhoneOff, TrendingDown, FileText, UserCheck, SearchX, Ban, type LucideIcon,
} from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { LeadRealtimeListener } from "@/components/leads/LeadRealtimeListener"
import { LogWhatsAppModal } from "@/components/queue/LogWhatsAppModal"
import { ContactActions } from "@/components/shared/ContactActions"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo, formatDuration } from "@/lib/format"
import { useHasRole } from "@/hooks/useCurrentUser"

async function fetchLead(id: string) {
  const res = await fetch(`/api/leads/${id}`, { credentials: "include" })
  if (!res.ok) throw new Error("Lead not found")
  return res.json()
}

const SIGNAL_LABELS: Record<string, { label: string; positive: boolean }> = {
  CALL_ANSWERED_INTERESTED:     { label: "Answered — Interested",       positive: true  },
  CALL_ANSWERED_NOT_INTERESTED: { label: "Answered — Not Interested",   positive: false },
  CALL_ANSWERED_CALLBACK:       { label: "Answered — Callback",         positive: true  },
  CALL_ANSWERED_WRONG_NUMBER:   { label: "Wrong Number",                positive: false },
  CALL_NO_ANSWER:               { label: "No Answer",                   positive: false },
  CALL_BUSY:                    { label: "Busy",                        positive: false },
  CALL_SWITCHED_OFF:            { label: "Switched Off",                positive: false },
  WA_REPLIED_1H:                { label: "WA — Replied < 1h",           positive: true  },
  WA_REPLIED_SAME_DAY:          { label: "WA — Replied same day",       positive: true  },
  WA_REPLIED_NEXT_DAY:          { label: "WA — Replied next day",       positive: true  },
  WA_NO_REPLY_24H:              { label: "WA — No reply 24h",           positive: false },
  WA_NO_REPLY_48H:              { label: "WA — No reply 48h",           positive: false },
  WA_BLOCKED:                   { label: "WA — Blocked",                positive: false },
  WA_TAG_NEGOTIATING:           { label: "WA — Negotiating",            positive: true  },
  WA_TAG_SITE_VISIT:            { label: "WA — Requested site visit",   positive: true  },
  WA_TAG_COMPARING:             { label: "WA — Comparing",              positive: true  },
  WA_TAG_NOT_INTERESTED:        { label: "WA — Not interested",         positive: false },
  SOURCE_BASELINE:              { label: "Source baseline",             positive: true  },
  INTENT_DECAY:                 { label: "Intent decay",                positive: false },
  IMPORT_HIGH_INTENT:           { label: "Import — High intent",        positive: true  },
  IMPORT_MEDIUM_INTENT:         { label: "Import — Medium intent",      positive: true  },
  IMPORT_LOW_INTENT:            { label: "Import — Low intent",         positive: true  },
  IMPORT_RECENT_CONTACT:        { label: "Import — Recent contact",     positive: true  },
  IMPORT_WARM_CONTACT:          { label: "Import — Warm contact",       positive: true  },
  IMPORT_STALE_CONTACT:         { label: "Import — Stale contact",      positive: false },
  IMPORT_ACTIVE_INTEREST:       { label: "Import — Active interest",    positive: true  },
  IMPORT_NEGATIVE_SIGNAL:       { label: "Import — Negative signal",    positive: false },
}

const SIGNAL_ICONS: Record<string, { icon: LucideIcon; iconColor: string; bgColor: string }> = {
  CALL_ANSWERED_INTERESTED:     { icon: Phone,         iconColor: "text-emerald-600", bgColor: "bg-emerald-50"  },
  CALL_ANSWERED_CALLBACK:       { icon: Phone,         iconColor: "text-sky-600",    bgColor: "bg-sky-50"     },
  CALL_ANSWERED_NOT_INTERESTED: { icon: Phone,         iconColor: "text-slate-500",   bgColor: "bg-slate-100"   },
  CALL_ANSWERED_WRONG_NUMBER:   { icon: Phone,         iconColor: "text-slate-400",   bgColor: "bg-slate-100"   },
  CALL_NO_ANSWER:               { icon: PhoneOff,      iconColor: "text-slate-400",   bgColor: "bg-slate-100"   },
  CALL_BUSY:                    { icon: PhoneOff,      iconColor: "text-slate-400",   bgColor: "bg-slate-100"   },
  CALL_SWITCHED_OFF:            { icon: PhoneOff,      iconColor: "text-slate-400",   bgColor: "bg-slate-100"   },
  WA_REPLIED_1H:                { icon: MessageCircle, iconColor: "text-emerald-600", bgColor: "bg-emerald-50"  },
  WA_REPLIED_SAME_DAY:          { icon: MessageCircle, iconColor: "text-sky-600",    bgColor: "bg-sky-50"     },
  WA_REPLIED_NEXT_DAY:          { icon: MessageCircle, iconColor: "text-sky-600",    bgColor: "bg-sky-50"     },
  WA_NO_REPLY_24H:              { icon: MessageCircle, iconColor: "text-slate-400",   bgColor: "bg-slate-100"   },
  WA_NO_REPLY_48H:              { icon: MessageCircle, iconColor: "text-slate-400",   bgColor: "bg-slate-100"   },
  WA_BLOCKED:                   { icon: X,             iconColor: "text-red-500",     bgColor: "bg-red-50"      },
  WA_TAG_NEGOTIATING:           { icon: MessageCircle, iconColor: "text-sky-600",    bgColor: "bg-sky-50"     },
  WA_TAG_SITE_VISIT:            { icon: MessageCircle, iconColor: "text-sky-600",    bgColor: "bg-sky-50"     },
  WA_TAG_COMPARING:             { icon: MessageCircle, iconColor: "text-amber-600",   bgColor: "bg-amber-50"    },
  WA_TAG_NOT_INTERESTED:        { icon: MessageCircle, iconColor: "text-slate-400",   bgColor: "bg-slate-100"   },
  INTENT_DECAY:                 { icon: TrendingDown,  iconColor: "text-red-400",     bgColor: "bg-red-50"      },
}
const DEFAULT_SIGNAL_ICON = { icon: Zap, iconColor: "text-slate-400", bgColor: "bg-slate-100" }

const ACTION_STYLES: Record<string, { tint: string; pill: string; pillRing: string; text: string; sub: string }> = {
  A: { tint: "bg-emerald-50/70", pill: "from-emerald-400 to-emerald-500", pillRing: "rgba(16,185,129,0.28)", text: "text-emerald-800", sub: "text-emerald-700/80" },
  B: { tint: "bg-sky-50/80",     pill: "from-sky-400 to-sky-500",         pillRing: "rgba(14,165,233,0.28)", text: "text-sky-800",     sub: "text-sky-700/80"     },
  C: { tint: "bg-amber-50/80",   pill: "from-amber-400 to-amber-500",     pillRing: "rgba(245,158,11,0.28)", text: "text-amber-800",   sub: "text-amber-700/80"   },
  D: { tint: "bg-slate-50/80",   pill: "from-slate-400 to-slate-500",     pillRing: "rgba(100,116,139,0.20)", text: "text-slate-700",  sub: "text-slate-500"      },
  E: { tint: "bg-rose-50/70",    pill: "from-rose-400 to-rose-500",       pillRing: "rgba(244,63,94,0.28)",  text: "text-rose-800",    sub: "text-rose-700/80"    },
  F: { tint: "bg-slate-50/80",   pill: "from-slate-400 to-slate-500",     pillRing: "rgba(100,116,139,0.20)", text: "text-slate-500",  sub: "text-slate-400"      },
}

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

export default function LeadRecordPage() {
  const params      = useParams()
  const router      = useRouter()
  const leadId      = params.id as string
  const queryClient = useQueryClient()
  const isManager   = useHasRole("ADMIN", "MANAGER")

  const [waOpen,       setWaOpen]       = useState(false)
  const [markingWon,   setMarkingWon]   = useState(false)
  const [markingLost,  setMarkingLost]  = useState(false)
  const [moreOpen,       setMoreOpen]       = useState(false)
  const [activeTab,      setActiveTab]      = useState<"timeline" | "whatsapp">("timeline")
  const [noteText,       setNoteText]       = useState("")
  const [savingNote,     setSavingNote]     = useState(false)
  const [scheduleOpen,   setScheduleOpen]   = useState(false)
  const [scheduleDate,   setScheduleDate]   = useState("")
  const [scheduleType,   setScheduleType]   = useState<"CALL" | "WHATSAPP">("CALL")
  const [scheduleNote,   setScheduleNote]   = useState("")
  const [scheduling,     setScheduling]     = useState(false)
  const [reassignOpen,   setReassignOpen]   = useState(false)
  const [reassignRepId,  setReassignRepId]  = useState("")
  const [reassigning,    setReassigning]    = useState(false)
  const [junkConfirm,    setJunkConfirm]    = useState(false)
  const [junking,        setJunking]        = useState(false)

  const { data: lead, isLoading, error } = useQuery({
    queryKey: ["lead", leadId],
    queryFn:  () => fetchLead(leadId),
  })

  const { data: teamData } = useQuery<{ data: { id: string; first_name: string; last_name: string | null }[] }>({
    queryKey: ["team-members"],
    queryFn:  async () => {
      const res = await fetch("/api/team/members", { credentials: "include" })
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: isManager,
    staleTime: 5 * 60_000,
  })
  const teamMembers = teamData?.data ?? []

  async function handleReassign() {
    if (!reassignRepId || reassigning) return
    setReassigning(true)
    const res = await fetch(`/api/leads/${leadId}/assign`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ rep_id: reassignRepId }),
    })
    setReassigning(false)
    if (res.ok) {
      toast.success("Lead reassigned")
      setReassignOpen(false)
      setReassignRepId("")
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
    } else {
      toast.error("Failed to reassign lead")
    }
  }

  async function handleMarkJunk() {
    setJunking(true)
    const res = await fetch(`/api/leads/${leadId}/junk`, { method: "POST", credentials: "include" })
    setJunking(false)
    if (res.ok) {
      toast.success("Lead marked as junk")
      setJunkConfirm(false)
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
    } else {
      toast.error("Failed to mark as junk")
    }
  }

  async function handleSaveNote() {
    if (!noteText.trim() || savingNote) return
    setSavingNote(true)
    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content: noteText.trim() }),
    })
    if (res.ok) {
      toast.success("Note saved")
      setNoteText("")
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
    } else {
      toast.error("Failed to save note")
    }
    setSavingNote(false)
  }

  async function handleScheduleFollowUp() {
    if (!scheduleDate || scheduling) return
    setScheduling(true)
    const res = await fetch(`/api/leads/${leadId}/follow-up`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        due_date:    new Date(scheduleDate).toISOString(),
        action_type: scheduleType,
        note:        scheduleNote.trim() || undefined,
      }),
    })
    setScheduling(false)
    if (res.ok) {
      toast.success("Follow-up scheduled")
      setScheduleOpen(false)
      setScheduleDate(""); setScheduleNote("")
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
    } else {
      toast.error("Failed to schedule follow-up")
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="max-w-2xl space-y-4">
      <Skeleton className="h-7 w-24 rounded-full" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  )

  if (error || !lead) return (
    <div className="max-w-2xl">
      <EmptyState
        icon={SearchX}
        title="Lead not found"
        description="This lead may have been removed, or it belongs to a different account."
        action={
          <Link
            href="/leads"
            className="h-9 px-5 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] text-white text-[13px] font-semibold inline-flex items-center transition-all active:scale-[0.97]"
          >
            Back to All Leads
          </Link>
        }
        className="glass-card mt-2"
      />
    </div>
  )

  const fullName    = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const actionStyle = ACTION_STYLES[lead.grade] ?? ACTION_STYLES["D"]
  const action      = lead.next_action

  return (
    <>
      <LeadRealtimeListener leadId={leadId} />

      <div className="max-w-2xl space-y-4">

        {/* ── Back ─────────────────────────────────────────────────────── */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400
                     hover:text-slate-700 transition-colors duration-150"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {/* ── Hero card ────────────────────────────────────────────────── */}
        <div className="glass-card px-5 pt-5 pb-4 space-y-4">

          {/* Identity row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <GradeBadge grade={lead.grade} size="lg" />
              <div className="min-w-0">
                <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">{fullName}</h1>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {lead.company_name && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                      <Building2 className="w-3 h-3 shrink-0" />{lead.company_name}
                    </span>
                  )}
                  {lead.designation && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                      <Briefcase className="w-3 h-3 shrink-0" />{lead.designation}
                    </span>
                  )}
                  {lead.city && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                      <MapPin className="w-3 h-3 shrink-0" />{lead.city}
                      {lead.state ? `, ${lead.state}` : ""}
                    </span>
                  )}
                </div>

                {/* Status badges */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {lead.is_junk && <Badge variant="destructive" className="text-[10px] px-2 py-0.5 rounded-full">Junk</Badge>}
                  {lead.is_sql  && <Badge className="bg-emerald-600 text-[10px] px-2 py-0.5 rounded-full">SQL</Badge>}
                  {lead.source && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full glass-1
                                     text-[11px] font-medium text-slate-600 border border-white/70">
                      {lead.source.name}
                    </span>
                  )}
                  {lead.stage && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full
                                     bg-sky-100/60 text-[11px] font-semibold text-sky-700
                                     border border-sky-200/60
                                     shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                      {lead.stage.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Value + more */}
            <div className="shrink-0 flex flex-col items-end gap-2">
              {lead.expected_value ? (
                <div className="text-right">
                  <p className="text-[24px] font-black tabular-nums text-slate-900 leading-none">
                    {formatValue(lead.expected_value)}
                  </p>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mt-0.5">
                    expected
                  </p>
                </div>
              ) : null}

              {/* More menu */}
              <div className="relative">
                <button
                  onClick={() => setMoreOpen((o) => !o)}
                  className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400
                             hover:bg-slate-100 hover:text-slate-700 transition-all duration-150"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                    <div className="absolute right-0 top-9 z-20 min-w-[170px] rounded-xl glass-3 gloss-edge py-1.5 overflow-hidden">
                      <button
                        onClick={() => { setMoreOpen(false); setMarkingWon(true) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-slate-700
                                   hover:bg-white/60 transition-colors"
                      >
                        <Trophy className="w-3.5 h-3.5 text-emerald-600" />
                        Mark as Won
                      </button>
                      <button
                        onClick={() => { setMoreOpen(false); setMarkingLost(true) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-slate-700
                                   hover:bg-white/60 transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-rose-500" />
                        Mark as Lost
                      </button>
                      {isManager && (
                        <>
                          <div className="my-1 border-t border-slate-200/40" />
                          <button
                            onClick={() => { setMoreOpen(false); setReassignOpen(true) }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-slate-700
                                       hover:bg-white/60 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-sky-500" />
                            Reassign rep
                          </button>
                        </>
                      )}
                      <div className="my-1 border-t border-slate-200/40" />
                      <button
                        onClick={() => { setMoreOpen(false); setJunkConfirm(true) }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-rose-600
                                   hover:bg-rose-50/60 transition-colors"
                      >
                        Mark as Junk
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Contact quick row */}
          <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
            <span className="text-[13px] font-semibold text-slate-900 tabular-nums flex-1 truncate">
              {lead.phone}
            </span>
            {lead.email && (
              <span className="text-[12px] text-slate-500 truncate flex-1">{lead.email}</span>
            )}
          </div>

          {/* Action buttons — shared Call / WhatsApp + one-tap outcome */}
          <ContactActions
            leadId={leadId}
            leadName={fullName}
            phone={lead.phone}
            variant="panel"
            trailing={
              <button
                onClick={() => setScheduleOpen(true)}
                title="Schedule follow-up"
                className="flex items-center justify-center w-10 h-10 rounded-full
                           glass-1 border border-white/70
                           text-slate-500 hover:text-slate-800
                           active:scale-[0.98] transition-all"
              >
                <Clock className="w-4 h-4" strokeWidth={2} />
              </button>
            }
          />
        </div>

        {/* ── Next Action ──────────────────────────────────────────────── */}
        {action && (
          <div className={`rounded-2xl glass-2 gloss-edge px-5 py-4 ${actionStyle.tint}`}>
            <div className="flex items-start gap-3">
              <div
                className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br ${actionStyle.pill}`}
                style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 12px ${actionStyle.pillRing}` }}
              >
                <Zap className="w-4 h-4" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className={`text-[14px] font-bold leading-snug ${actionStyle.text}`}>{action.label}</p>
                <p className={`text-[12px] mt-0.5 leading-relaxed ${actionStyle.sub}`}>{action.reason}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Scores ───────────────────────────────────────────────────── */}
        <div className="glass-card px-5 py-4">
          <p className="section-label mb-3">Lead Score</p>
          <div className="grid grid-cols-3 gap-4">
            <ScoreBar value={lead.fit_score}     label="Fit"     type="fit"     showValue />
            <ScoreBar value={lead.intent_score}  label="Intent"  type="intent"  showValue />
            <ScoreBar value={lead.quality_score} label="Quality" type="quality" showValue />
          </div>
        </div>

        {/* ── Details ──────────────────────────────────────────────────── */}
        <div className="glass-card px-5 py-4">
          <p className="section-label mb-3">Details</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
            <DetailRow label="Phone"  value={lead.phone} />
            {lead.email              && <DetailRow label="Email"          value={lead.email} truncate />}
            {lead.source             && <DetailRow label="Source"         value={lead.source.name} />}
            {lead.stage              && <DetailRow label="Stage"          value={lead.stage.name} />}
            {lead.state              && <DetailRow label="State"          value={lead.state} />}
            {lead.pincode            && <DetailRow label="Pincode"        value={lead.pincode} />}
            {lead.assigned_rep       && <DetailRow label="Assigned to"    value={`${lead.assigned_rep.first_name} ${lead.assigned_rep.last_name ?? ""}`.trim()} />}
            <DetailRow
              label="Added"
              value={timeAgo(lead.imported_at ?? lead.created_at)}
              icon={<Clock className="w-3 h-3" />}
            />
            {lead.first_contact_at   && <DetailRow label="First contact"  value={timeAgo(lead.first_contact_at)} icon={<Clock className="w-3 h-3" />} />}
            {lead.speed_to_lead_hours != null && (
              <DetailRow label="Speed to lead" value={formatDuration(lead.speed_to_lead_hours)} />
            )}
          </div>
        </div>

        {/* ── Inquiry / Notes ──────────────────────────────────────────── */}
        {lead.inquiry_text && (
          <div className="glass-card px-5 py-4">
            <p className="section-label mb-2">Inquiry / Notes</p>
            <p className="text-[13px] text-slate-700 leading-relaxed">{lead.inquiry_text}</p>
          </div>
        )}


        {/* ── Activity ─────────────────────────────────────────────────── */}
        <div className="glass-card px-5 py-4">
          {/* Tabs */}
          <div className="flex gap-5 border-b border-slate-200/60 mb-4">
            {(["timeline", "whatsapp"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors duration-150 ${
                  activeTab === tab
                    ? "border-sky-500 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab === "timeline" ? "Activity" : "WhatsApp"}
              </button>
            ))}
          </div>

          {activeTab === "timeline" && (
            <>
              {(() => {
                type SignalEntry = { type: "signal"; id: string; created_at: string; data: { signal_type: string; signal_value: number; intent_score_before: number; intent_score_after: number; created_at: string } }
                type NoteEntry  = { type: "note";   id: string; created_at: string; data: { id: string; content: string; created_at: string; user?: { first_name: string; last_name: string } } }
                type TimelineItem = SignalEntry | NoteEntry

                const items: TimelineItem[] = [
                  ...(lead.signals ?? []).map((s: SignalEntry["data"]) => ({ type: "signal" as const, id: s.signal_type + s.created_at, created_at: s.created_at, data: s })),
                  ...(lead.notes ?? []).map((n: NoteEntry["data"]) => ({ type: "note" as const, id: n.id, created_at: n.created_at, data: n })),
                ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

                if (items.length === 0) return (
                  <div className="py-6 text-center">
                    <p className="text-[12px] text-slate-400">No activity yet.</p>
                    <p className="text-[11px] text-slate-300 mt-0.5">Call or message this lead to start the log.</p>
                  </div>
                )

                return (
                  <div className="space-y-0">
                    {items.map((item, idx) => {
                      const isLast = idx === items.length - 1
                      if (item.type === "signal") {
                        const signal = item.data
                        const meta     = SIGNAL_LABELS[signal.signal_type] ?? { label: signal.signal_type, positive: signal.signal_value > 0 }
                        const iconConf = SIGNAL_ICONS[signal.signal_type] ?? DEFAULT_SIGNAL_ICON
                        const Icon     = iconConf.icon
                        const delta    = signal.intent_score_after - signal.intent_score_before
                        return (
                          <div key={item.id} className="flex items-start gap-3">
                            <div className="flex flex-col items-center shrink-0">
                              <div className={`w-6 h-6 rounded-full ${iconConf.bgColor} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-3 h-3 ${iconConf.iconColor}`} strokeWidth={2.5} />
                              </div>
                              {!isLast && <div className="w-px flex-1 bg-slate-100 mt-1" style={{ minHeight: 16 }} />}
                            </div>
                            <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[13px] font-medium text-slate-800 leading-snug">{meta.label}</p>
                                {delta !== 0 && (
                                  <span className={`text-[11px] font-semibold shrink-0 tabular-nums px-1.5 py-0.5 rounded-full ${
                                    delta > 0 ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-600"
                                  }`}>
                                    {delta > 0 ? "+" : ""}{delta}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(signal.created_at)}</p>
                            </div>
                          </div>
                        )
                      } else {
                        const note = item.data
                        return (
                          <div key={item.id} className="flex items-start gap-3">
                            <div className="flex flex-col items-center shrink-0">
                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                <FileText className="w-3 h-3 text-slate-400" strokeWidth={2} />
                              </div>
                              {!isLast && <div className="w-px flex-1 bg-slate-100 mt-1" style={{ minHeight: 16 }} />}
                            </div>
                            <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                              <p className="text-[13px] font-medium text-slate-800 leading-snug">{note.content}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {note.user ? `${note.user.first_name} ${note.user.last_name ?? ""}`.trim() + " · " : ""}
                                {timeAgo(note.created_at)}
                              </p>
                            </div>
                          </div>
                        )
                      }
                    })}
                  </div>
                )
              })()}

              {/* Add note */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add note</p>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type a note about this lead…"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-900
                             placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                             focus:border-sky-400 transition-all resize-none"
                />
                {noteText.trim() && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className="h-9 px-4 rounded-full text-white text-[12px] font-semibold
                                 bg-gradient-to-b from-sky-400 to-sky-500
                                 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                                 disabled:opacity-50 transition-all active:scale-[0.98]"
                    >
                      {savingNote ? "Saving…" : "Save note"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "whatsapp" && (
            <WhatsAppTab signals={lead.signals ?? []} onLog={() => setWaOpen(true)} />
          )}
        </div>

      </div>

      {/* Modals */}
      <LogWhatsAppModal open={waOpen}   onClose={() => setWaOpen(false)}   leadId={leadId} leadName={fullName} />

      {/* Schedule follow-up modal */}
      {scheduleOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="rounded-2xl glass-3 gloss-edge p-6 w-full max-w-sm space-y-4
                          shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-slate-900">Schedule Follow-up</h2>
              <button onClick={() => setScheduleOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400
                           hover:text-slate-700 hover:bg-white/70 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Action Type
              </label>
              <div className="flex gap-2">
                {(["CALL", "WHATSAPP"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setScheduleType(t)}
                    className={`flex-1 h-9 rounded-xl text-[13px] font-semibold transition-all ${
                      scheduleType === t
                        ? "text-white bg-gradient-to-b from-sky-400 to-sky-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.28)]"
                        : "bg-white/70 border border-slate-200/70 text-slate-600 hover:text-slate-900 hover:border-sky-300"
                    }`}
                  >
                    {t === "CALL" ? "Call" : "WhatsApp"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Due Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={scheduleDate}
                min={new Date().toISOString().slice(0, 16)}
                onChange={e => setScheduleDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] bg-white/80
                           focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Note (optional)
              </label>
              <textarea
                value={scheduleNote}
                onChange={e => setScheduleNote(e.target.value)}
                placeholder="What to cover in this follow-up…"
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] bg-white/80
                           placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                           focus:border-sky-400 transition-all resize-none"
              />
            </div>

            <button
              onClick={handleScheduleFollowUp}
              disabled={!scheduleDate || scheduling}
              className="w-full h-10 rounded-full text-white text-[13px] font-semibold transition-all
                         bg-gradient-to-b from-sky-400 to-sky-500
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                         disabled:opacity-50 active:scale-[0.98]"
            >
              {scheduling ? "Scheduling…" : "Schedule Follow-up"}
            </button>
          </div>
        </div>
        </ModalPortal>
      )}

      {markingWon && (
        <WonModal leadId={leadId} onClose={() => setMarkingWon(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["lead", leadId] }); setMarkingWon(false) }}
        />
      )}
      {markingLost && (
        <LostModal leadId={leadId} onClose={() => setMarkingLost(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["lead", leadId] }); setMarkingLost(false) }}
        />
      )}

      {/* ── Reassign modal ──────────────────────────────────────────────── */}
      {reassignOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl glass-3 gloss-edge p-6 space-y-4
                          shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <p className="text-[16px] font-bold text-slate-900">Reassign rep</p>
              <button onClick={() => setReassignOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/70 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ThemedSelect
              value={reassignRepId}
              onValueChange={setReassignRepId}
              options={teamMembers.map(m => ({ value: m.id, label: `${m.first_name}${m.last_name ? ` ${m.last_name}` : ""}` }))}
              placeholder="Select rep…"
              aria-label="Reassign rep"
            />
            <button
              onClick={handleReassign}
              disabled={!reassignRepId || reassigning}
              className="w-full h-10 rounded-full text-white text-[13px] font-semibold transition-all
                         bg-gradient-to-b from-sky-400 to-sky-500
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                         disabled:opacity-50 active:scale-[0.98]"
            >
              {reassigning ? "Reassigning…" : "Confirm Reassign"}
            </button>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Mark-as-junk confirmation — destructive, so never one-click */}
      {junkConfirm && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl glass-3 gloss-edge p-6 space-y-4
                          shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-rose-600" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-bold text-slate-900 leading-tight">Mark as junk?</p>
                <p className="text-[12px] text-slate-500 mt-0.5">This removes the lead from your active queue and pipeline.</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setJunkConfirm(false)}
                className="flex-1 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold
                           text-slate-600 hover:bg-white/70 transition-all bg-white/40"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkJunk}
                disabled={junking}
                className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold transition-all
                           bg-gradient-to-b from-rose-500 to-rose-600
                           shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_12px_rgba(244,63,94,0.32)]
                           disabled:opacity-50 active:scale-[0.98]"
              >
                {junking ? "Marking…" : "Mark as junk"}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}

// ── Detail Row ────────────────────────────────────────────────────────────────

function DetailRow({ label, value, icon, truncate }: {
  label: string; value: string; icon?: React.ReactNode; truncate?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-[13px] font-medium text-slate-800 flex items-center gap-1 ${truncate ? "truncate" : ""}`}>
        {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
        {value}
      </p>
    </div>
  )
}

// ── WhatsApp Tab ──────────────────────────────────────────────────────────────

const WA_SIGNAL_TYPES = [
  "WA_REPLIED_1H", "WA_REPLIED_SAME_DAY", "WA_REPLIED_NEXT_DAY",
  "WA_NO_REPLY_24H", "WA_NO_REPLY_48H", "WA_BLOCKED",
  "WA_TAG_NEGOTIATING", "WA_TAG_SITE_VISIT", "WA_TAG_COMPARING", "WA_TAG_NOT_INTERESTED",
]

const WA_STAGE_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  INITIATED:   "Message sent",
  REPLIED:     "Replied",
  NEGOTIATING: "Negotiating",
  SITE_VISIT:  "Site visit requested",
  COMPARING:   "Comparing options",
  CLOSED:      "Closed",
}

function WhatsAppTab({ signals, onLog }: {
  signals: { id: string; signal_type: string; signal_value: number; intent_score_before: number; intent_score_after: number; created_at: string }[]
  onLog: () => void
}) {
  const waSignals = signals.filter((s) => WA_SIGNAL_TYPES.includes(s.signal_type))

  let waStage = "NOT_STARTED"
  for (const s of [...waSignals].reverse()) {
    if (s.signal_type === "WA_TAG_NEGOTIATING")    { waStage = "NEGOTIATING"; break }
    if (s.signal_type === "WA_TAG_SITE_VISIT")     { waStage = "SITE_VISIT";  break }
    if (s.signal_type === "WA_TAG_COMPARING")      { waStage = "COMPARING";   break }
    if (s.signal_type === "WA_TAG_NOT_INTERESTED") { waStage = "CLOSED";      break }
    if (s.signal_type.startsWith("WA_REPLIED"))    { waStage = "REPLIED";     break }
    if (s.signal_type.startsWith("WA_NO_REPLY") || s.signal_type === "WA_BLOCKED") {
      if (waStage === "NOT_STARTED") waStage = "INITIATED"
    }
  }
  if (waSignals.length > 0 && waStage === "NOT_STARTED") waStage = "INITIATED"

  const stageBadge = (
    ["REPLIED","NEGOTIATING","SITE_VISIT"].includes(waStage)
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : waStage === "CLOSED"
        ? "bg-red-50 text-red-700 border border-red-200"
        : waStage === "COMPARING"
          ? "bg-amber-50 text-amber-700 border border-amber-200"
          : "bg-slate-100 text-slate-500 border border-slate-200"
  )

  return (
    <div className="space-y-4">
      {/* Stage indicator */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">WA Stage</span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stageBadge}`}>
          {WA_STAGE_LABELS[waStage] ?? waStage}
        </span>
      </div>

      {waSignals.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[13px] text-slate-400">No WhatsApp interactions logged yet.</p>
          <button
            onClick={onLog}
            className="mt-3 text-[13px] font-semibold text-sky-600 hover:text-sky-700 transition-colors"
          >
            + Log WhatsApp interaction
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {waSignals.map((s) => {
              const meta  = SIGNAL_LABELS[s.signal_type] ?? { label: s.signal_type, positive: s.signal_value > 0 }
              const delta = s.intent_score_after - s.intent_score_before
              return (
                <div key={s.id} className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${meta.positive ? "bg-emerald-500" : "bg-red-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-800">{meta.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(s.created_at)}</p>
                  </div>
                  {delta !== 0 && (
                    <span className={`text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${
                      delta > 0 ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-600"
                    }`}>
                      {delta > 0 ? "+" : ""}{delta}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <button
            onClick={onLog}
            className="text-[13px] font-semibold text-sky-600 hover:text-sky-700 transition-colors"
          >
            + Log WhatsApp interaction
          </button>
        </>
      )}
    </div>
  )
}

// ── Won Modal ─────────────────────────────────────────────────────────────────

function WonModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess: () => void }) {
  const [value,  setValue]  = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!value || !reason) { toast.error("Deal value and win reason are required"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/won`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ won_value: parseInt(value), win_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Lead marked as Won!"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl glass-3 gloss-edge p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-slate-900">Mark as Won</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Deal Value (₹) <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] bg-white/80
                       focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="e.g. 50000"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Win Reason <span className="text-rose-500">*</span>
          </label>
          <ThemedSelect
            value={reason}
            onValueChange={setReason}
            options={[
              { value: "PRICE_MATCH", label: "Price Match" },
              { value: "PRODUCT_FIT", label: "Product Fit" },
              { value: "RELATIONSHIP", label: "Relationship" },
              { value: "COMPETITOR_LOST", label: "Competitor Lost" },
              { value: "URGENCY", label: "Urgency" },
              { value: "OTHER", label: "Other" },
            ]}
            placeholder="Select reason…"
            aria-label="Win reason"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold
                       text-slate-600 hover:bg-white/70 transition-all bg-white/40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold transition-all
                       bg-gradient-to-b from-emerald-400 to-emerald-500
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(16,185,129,0.32)]
                       disabled:opacity-50 active:scale-[0.98]"
          >
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
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ loss_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Lead marked as Lost"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="rounded-2xl glass-3 gloss-edge p-6 w-full max-w-sm space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-slate-900">Mark as Lost</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full
                                               text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Loss Reason <span className="text-rose-500">*</span>
          </label>
          <ThemedSelect
            value={reason}
            onValueChange={setReason}
            options={[
              { value: "PRICE_TOO_HIGH", label: "Price Too High" },
              { value: "WENT_TO_COMPETITOR", label: "Went to Competitor" },
              { value: "NO_BUDGET", label: "No Budget" },
              { value: "NO_REQUIREMENT", label: "No Requirement" },
              { value: "NO_RESPONSE", label: "No Response" },
              { value: "TIMING", label: "Wrong Timing" },
              { value: "OTHER", label: "Other" },
            ]}
            placeholder="Select reason…"
            aria-label="Loss reason"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold
                       text-slate-600 hover:bg-white/70 transition-all bg-white/40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold transition-all
                       bg-gradient-to-b from-rose-400 to-rose-500
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(244,63,94,0.32)]
                       disabled:opacity-50 active:scale-[0.98]"
          >
            {saving ? "Saving…" : "Mark Lost"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
