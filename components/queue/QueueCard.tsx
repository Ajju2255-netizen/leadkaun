"use client"

import { useState } from "react"
import Link from "next/link"
import { Phone, MessageCircle, ExternalLink } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { Badge } from "@/components/ui/badge"
import { LogCallModal } from "./LogCallModal"
import { LogWhatsAppModal } from "./LogWhatsAppModal"
import type { QueueLead } from "@/hooks/useQueue"

interface Props {
  lead: QueueLead
}

const GRADE_BORDER: Record<string, string> = {
  A: "border-l-green-500",
  B: "border-l-blue-500",
  C: "border-l-amber-400",
  D: "border-l-orange-500",
  E: "border-l-red-500",
  F: "border-l-slate-300",
}

export function QueueCard({ lead }: Props) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen, setWaOpen]     = useState(false)

  const fullName   = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const borderColor = GRADE_BORDER[lead.grade] ?? GRADE_BORDER["F"]

  return (
    <>
      <div className={`rounded-xl bg-white card-shadow border-l-4 ${borderColor} p-4 space-y-3 hover:card-shadow-md transition-shadow`}>

        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <GradeBadge grade={lead.grade} />
            <div className="min-w-0">
              <Link
                href={`/leads/${lead.id}`}
                className="font-semibold text-sm text-slate-800 hover:text-indigo-600 transition-colors leading-tight truncate block"
              >
                {fullName}
              </Link>
              {lead.company_name && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.company_name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {lead.followups_due > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0">
                {lead.followups_due} due
              </Badge>
            )}
            {lead.city && (
              <span className="text-xs text-muted-foreground">{lead.city}</span>
            )}
          </div>
        </div>

        {/* NBA */}
        {lead.nba && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
            <p className="text-xs font-semibold text-indigo-900">{lead.nba.action}</p>
            <p className="text-xs text-indigo-600/80 mt-0.5">{lead.nba.reason}</p>
          </div>
        )}

        {/* Score bars */}
        <div className="grid grid-cols-3 gap-3">
          <ScoreBar value={lead.fit_score}     label="Fit"     type="fit"     showValue />
          <ScoreBar value={lead.intent_score}  label="Intent"  type="intent"  showValue />
          <ScoreBar value={lead.quality_score} label="Quality" type="quality" showValue />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={() => setCallOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            Log Call
          </button>
          <button
            onClick={() => setWaOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Log WA
          </button>
          <Link
            href={`/leads/${lead.id}`}
            className="flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors p-2"
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
