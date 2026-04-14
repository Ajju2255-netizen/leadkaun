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

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

export function QueueCard({ lead }: Props) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen, setWaOpen]     = useState(false)

  const fullName    = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const borderColor = GRADE_BORDER[lead.grade] ?? GRADE_BORDER["F"]
  const isHot       = lead.grade === "A" || lead.grade === "B"

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
              <span className={`text-[13px] font-bold tabular-nums ${isHot ? "text-emerald-700" : "text-slate-600"}`}>
                {formatValue(lead.expected_value)}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Action banner ────────────────────────────────────────────────── */}
        <div className={`rounded-lg px-3 py-2.5 border ${lead.next_action.color}`}>
          <p className="text-[12px] font-semibold leading-snug">{lead.next_action.label}</p>
          <p className="text-[11px] mt-0.5 leading-snug opacity-80">{lead.next_action.reason}</p>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
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
