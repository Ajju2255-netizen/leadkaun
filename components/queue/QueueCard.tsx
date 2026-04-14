"use client"

import { useState } from "react"
import Link from "next/link"
import { Phone, MessageCircle, ExternalLink, MapPin } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
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
  D: "border-l-slate-300",
  E: "border-l-red-400",
  F: "border-l-slate-200",
}

const RISK_TAGLINE: Record<string, string> = {
  A: "High drop risk — leads go cold in 24–48h",
  B: "Competitors may be calling — don't wait",
  C: "Warm nurture window — send material today",
}

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

function UrgencyBadge({ hours }: { hours: number | null }) {
  if (hours === null) return null
  if (hours < 2)   return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">🔥 Fresh lead — act now</span>
  if (hours < 8)   return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">⏰ Warming up — contact today</span>
  if (hours < 24)  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">📉 Cooling down</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">❄️ Going cold</span>
}

export function QueueCard({ lead }: Props) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen, setWaOpen]     = useState(false)

  const fullName    = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const borderColor = GRADE_BORDER[lead.grade] ?? GRADE_BORDER["F"]
  const isHot       = lead.grade === "A" || lead.grade === "B"
  const riskTagline = RISK_TAGLINE[lead.grade]

  return (
    <>
      <div className={`
        rounded-xl bg-white border-l-[3px] ${borderColor}
        shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]
        hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_2px_4px_rgba(15,23,42,0.05)]
        transition-shadow duration-200 p-4 space-y-3
      `}>

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
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {lead.company_name && (
                  <p className="text-[12px] text-slate-400 truncate leading-tight">{lead.company_name}</p>
                )}
                {lead.city && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400">
                    <MapPin className="w-2.5 h-2.5" />
                    {lead.city}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Value pill */}
          {lead.expected_value ? (
            <div className="shrink-0 text-right">
              <span className={`text-[15px] font-bold tabular-nums ${isHot ? "text-emerald-700" : "text-slate-600"}`}>
                {formatValue(lead.expected_value)}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Urgency badge (A/B only) ──────────────────────────────────── */}
        {isHot && (
          <UrgencyBadge hours={lead.hours_since_import} />
        )}

        {/* ── Action banner ────────────────────────────────────────────────── */}
        <div className={`rounded-lg px-3 py-2.5 border ${lead.next_action.color}`}>
          <p className="text-[12px] font-semibold leading-snug">{lead.next_action.label}</p>
          <p className="text-[11px] mt-0.5 leading-snug opacity-80">{lead.next_action.reason}</p>
        </div>

        {/* ── Risk tagline ─────────────────────────────────────────────────── */}
        {riskTagline && (
          <p className="text-[11px] text-slate-400 font-medium">{riskTagline}</p>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCallOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[12px] font-semibold py-2 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
            {isHot ? "📞 Call Now" : "Log Call"}
          </button>
          <button
            onClick={() => setWaOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[12px] font-semibold py-2 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
            {isHot ? "💬 Message" : "Log WA"}
          </button>
          <Link
            href={`/leads/${lead.id}`}
            className="flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-400 hover:text-slate-600 transition-colors p-2"
            title="View full lead"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

      </div>

      <LogCallModal     open={callOpen} onClose={() => setCallOpen(false)} leadId={lead.id} leadName={fullName} />
      <LogWhatsAppModal open={waOpen}   onClose={() => setWaOpen(false)}   leadId={lead.id} leadName={fullName} />
    </>
  )
}
