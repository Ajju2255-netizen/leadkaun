"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Phone, MessageCircle, ArrowUpRight } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { LogCallModal } from "./LogCallModal"
import { LogWhatsAppModal } from "./LogWhatsAppModal"
import { coldCountdown, COLD_THRESHOLD_H } from "./QueueCard"
import type { QueueLead } from "@/hooks/useQueue"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

// ── "Why This Matters" decision intelligence block ────────────────────────────

function WhyThisMatters({ lead }: { lead: QueueLead }) {
  // Case 1: Active hot signal
  if (lead.is_hot_signal && lead.minutes_since_last_signal != null) {
    return (
      <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 space-y-1">
        <p className="section-label" style={{ color: "#0EA5E9" }}>Active Signal</p>
        <p className="text-[13px] font-semibold text-sky-900 leading-snug">
          User active {formatMins(lead.minutes_since_last_signal)} — peak engagement window
        </p>
        <p className="text-[11px] text-sky-700 leading-relaxed">
          Highest-probability contact moment. Each minute of delay reduces response rate.
        </p>
      </div>
    )
  }

  // Case 2: Grade A
  if (lead.grade === "A") {
    const countdown = coldCountdown(lead)
    const isUrgent = countdown !== null && countdown.color.includes("red")
    const bg = isUrgent ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
    return (
      <div className={`rounded-xl border px-4 py-3 space-y-1 ${bg}`}>
        <p className="section-label">Revenue at Stake</p>
        {lead.expected_value && (
          <p className="text-[14px] font-black tabular-nums text-slate-900">
            {formatValue(lead.expected_value)} in this window
          </p>
        )}
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Grade A leads go cold in 6h. Contact in the first hour has the highest close rate — delay compounds loss.
        </p>
      </div>
    )
  }

  // Case 3: Grade B
  if (lead.grade === "B") {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
        <p className="text-[12px] text-slate-700 leading-relaxed">
          Same-day contact required. Grade B leads go cold in 24h — first contact today keeps conversion high.
        </p>
      </div>
    )
  }

  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QueueContextPanel({
  leads,
  selectedId,
}: {
  leads:      QueueLead[]
  selectedId: string | null
}) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen,   setWaOpen]   = useState(false)
  const [, setTick] = useState(0)

  const lead = (selectedId ? leads.find((l) => l.id === selectedId) : null) ?? leads[0]
  const leadId = lead?.id
  const isHotGrade = lead?.grade === "A" || lead?.grade === "B"

  // Live tick so countdown + urgency bar update in real-time for hot leads
  useEffect(() => {
    if (!leadId || !isHotGrade) return
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [leadId, isHotGrade])

  if (!lead) {
    return (
      <div className="glass-card p-5">
        <p className="text-[12px] text-slate-400">No leads in queue.</p>
      </div>
    )
  }

  const fullName   = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const isHot      = lead.grade === "A" || lead.grade === "B"
  const countdown  = isHot && !lead.is_hot_signal ? coldCountdown(lead) : null
  const threshold  = COLD_THRESHOLD_H[lead.grade]

  // Urgency percentage for visual context
  let urgencyPct: number | null = null
  if (isHot && threshold) {
    const hoursElapsed = lead.last_action_at
      ? (Date.now() - new Date(lead.last_action_at).getTime()) / 3_600_000
      : (lead.hours_since_import ?? 0)
    urgencyPct = Math.max(0, Math.min(100, ((threshold - hoursElapsed) / threshold) * 100))
  }

  return (
    <>
      <div className="glass-card p-5 space-y-4">

        {/* ── Header label ────────────────────────────────────────────── */}
        <p className="section-label">
          {selectedId && selectedId !== leads[0]?.id ? "Selected" : "Highest Priority"}
        </p>

        {/* ── Identity ────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <GradeBadge grade={lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="md" />
              <Link
                href={`/leads/${lead.id}`}
                className="block text-[16px] font-bold text-slate-900 hover:text-sky-600 transition-colors leading-snug"
              >
                {fullName}
              </Link>
              {lead.company_name && (
                <p className="text-[12px] text-slate-400">{lead.company_name}</p>
              )}
            </div>
            {lead.expected_value && (
              <div className="text-right shrink-0">
                <p className="text-[22px] font-black tabular-nums leading-none text-slate-900">
                  {formatValue(lead.expected_value)}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">expected</p>
              </div>
            )}
          </div>

          {/* Urgency progress */}
          {urgencyPct !== null && (
            <div className="pt-1">
              <div className="h-[3px] rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    urgencyPct < 20 ? "bg-red-500 urgent-blink" : urgencyPct < 50 ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                  style={{ width: `${urgencyPct}%` }}
                />
              </div>
              {countdown && (
                <p className={`text-[11px] font-semibold mt-1.5 ${countdown.color}`}>
                  {countdown.label}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Why this matters ─────────────────────────────────────────── */}
        <WhyThisMatters lead={lead} />

        {/* ── Score breakdown ──────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <p className="section-label">Lead Score</p>
          <ScoreBar type="fit"     value={lead.fit_score}     label="Fit"     />
          <ScoreBar type="intent"  value={lead.intent_score}  label="Intent"  />
          <ScoreBar type="quality" value={lead.quality_score} label="Quality" />
        </div>

        {/* ── Recommended action ───────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="section-label">Recommended Action</p>
          <p className="text-[13px] font-semibold text-slate-900 leading-snug">
            {lead.next_action.label}
          </p>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {lead.next_action.reason}
          </p>
        </div>

        {/* ── Action buttons ───────────────────────────────────────────── */}
        <div className="flex gap-2">
          <button
            onClick={() => setCallOpen(true)}
            className="flex-1 btn-primary h-9 flex items-center justify-center gap-1.5"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
            Call
          </button>
          <button
            onClick={() => setWaOpen(true)}
            className="flex-1 btn-secondary h-9 flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={2} />
            Message
          </button>
        </div>

        {/* ── Profile link ────────────────────────────────────────────── */}
        <Link
          href={`/leads/${lead.id}`}
          className="flex items-center justify-center gap-0.5 text-[11px] font-semibold text-sky-600 hover:text-sky-700 transition-colors"
        >
          View full profile <ArrowUpRight className="w-3 h-3" />
        </Link>

      </div>

      <LogCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        leadId={lead.id}
        leadName={fullName}
      />
      <LogWhatsAppModal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        leadId={lead.id}
        leadName={fullName}
      />
    </>
  )
}
