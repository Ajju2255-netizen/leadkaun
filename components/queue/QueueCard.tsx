"use client"

import { useState } from "react"
import Link from "next/link"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LogCallModal } from "./LogCallModal"
import { LogWhatsAppModal } from "./LogWhatsAppModal"
import type { QueueLead } from "@/hooks/useQueue"

interface Props {
  lead: QueueLead
}

export function QueueCard({ lead }: Props) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen, setWaOpen]     = useState(false)

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")

  return (
    <>
      <div className="rounded-lg border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <GradeBadge grade={lead.grade} />
            <div className="min-w-0">
              <Link
                href={`/leads/${lead.id}`}
                className="font-medium text-sm hover:underline leading-tight truncate block"
              >
                {fullName}
              </Link>
              {lead.company_name && (
                <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>
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
          <div className="rounded-md bg-muted px-3 py-2">
            <p className="text-xs font-medium">{lead.nba.action}</p>
            <p className="text-xs text-muted-foreground">{lead.nba.reason}</p>
          </div>
        )}

        {/* Score bars */}
        <div className="grid grid-cols-3 gap-3">
          <ScoreBar value={lead.fit_score}     label="Fit"     type="fit"     showValue />
          <ScoreBar value={lead.intent_score}  label="Intent"  type="intent"  showValue />
          <ScoreBar value={lead.quality_score} label="Quality" type="quality" showValue />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" className="flex-1" onClick={() => setCallOpen(true)}>
            Log Call
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setWaOpen(true)}>
            Log WA
          </Button>
          <Link href={`/leads/${lead.id}`}>
            <Button size="sm" variant="ghost">View</Button>
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
