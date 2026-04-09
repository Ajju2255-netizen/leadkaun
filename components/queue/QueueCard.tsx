"use client"

/*
 * QueueCard — the primary work surface for sales reps.
 *
 * Design intent:
 *   The card is the most-touched UI in the product. Every decision should
 *   reduce friction and increase confidence in the action to take.
 *
 *   Layout: grade badge anchors the eye top-left (F-pattern reading start),
 *   name/company follows, NBA surfaces the single most useful next action,
 *   score bars give signal-at-a-glance, action buttons are large enough for
 *   one-tap on mobile.
 *
 *   Grade border: a 3px left border in grade colour gives immediate peripheral
 *   awareness of priority without requiring the user to read the badge.
 *   Colour semantics match GradeBadge for consistency.
 *
 *   NBA box: slate-50 tinted, indigo text — calm but distinct. Not alarming.
 *   The brain treats soft blue-slate as "information" vs red as "danger".
 *
 *   Actions: Log Call (indigo, primary CTA) > Log WA (emerald, secondary CTA)
 *   > View (ghost). Visual weight mirrors action importance.
 */

import { useState } from "react"
import Link from "next/link"
import { Phone, MessageCircle, ExternalLink, MapPin, Clock } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { LogCallModal } from "./LogCallModal"
import { LogWhatsAppModal } from "./LogWhatsAppModal"
import type { QueueLead } from "@/hooks/useQueue"

interface Props {
  lead: QueueLead
}

const GRADE_BORDER: Record<string, string> = {
  A: "border-l-emerald-500",
  B: "border-l-blue-500",
  C: "border-l-amber-400",
  D: "border-l-orange-500",
  E: "border-l-red-500",
  F: "border-l-slate-200",
}

export function QueueCard({ lead }: Props) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen, setWaOpen]     = useState(false)

  const fullName    = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const borderColor = GRADE_BORDER[lead.grade] ?? GRADE_BORDER["F"]

  return (
    <>
      <div
        className={`
          rounded-xl bg-white border-l-[3px] ${borderColor}
          shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]
          hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_2px_4px_rgba(15,23,42,0.05)]
          transition-shadow duration-200 p-4 space-y-3
        `}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <GradeBadge grade={lead.grade} size="md" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/leads/${lead.id}`}
                className="text-[13px] font-semibold text-slate-800 hover:text-blue-600 transition-colors leading-snug truncate block"
              >
                {fullName}
              </Link>
              {lead.company_name && (
                <p className="text-[12px] text-slate-400 truncate mt-0.5 leading-tight">
                  {lead.company_name}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {lead.followups_due > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 ring-1 ring-red-200 px-1.5 py-0.5 rounded">
                <Clock className="w-3 h-3" />
                {lead.followups_due} due
              </span>
            )}
            {lead.city && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400">
                <MapPin className="w-3 h-3" />
                {lead.city}
              </span>
            )}
          </div>
        </div>

        {/* ── Next Best Action ─────────────────────────────────────────────── */}
        {lead.nba && (
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
            <p className="text-[12px] font-semibold text-slate-700 leading-snug">
              {lead.nba.action}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              {lead.nba.reason}
            </p>
          </div>
        )}

        {/* ── Score bars ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <ScoreBar value={lead.fit_score}     label="Fit"     type="fit"     showValue />
          <ScoreBar value={lead.intent_score}  label="Intent"  type="intent"  showValue />
          <ScoreBar value={lead.quality_score} label="Quality" type="quality" showValue />
        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={() => setCallOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[12px] font-semibold py-2 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
            Log Call
          </button>
          <button
            onClick={() => setWaOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[12px] font-semibold py-2 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
            Log WA
          </button>
          <Link
            href={`/leads/${lead.id}`}
            className="flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-400 hover:text-slate-600 transition-colors p-2"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

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
