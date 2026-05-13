"use client"

/**
 * QueueTopFive — top-N ranked card list at the hero of /queue.
 *
 * Uses the shared QueueLeadRow with `rank` set, so it renders identically
 * to the rows below in the grade-grouped sections — except for the rank
 * ribbon + crown on top-3. Single visual language across the whole page.
 */

import { QueueLeadRow } from "./QueueLeadRow"
import type { QueueLead } from "@/hooks/useQueue"

export interface QueueTopFiveProps {
  leads: QueueLead[]
  onLeadClick: (leadId: string) => void
}

export function QueueTopFive({ leads, onLeadClick }: QueueTopFiveProps) {
  if (leads.length === 0) {
    return (
      <div className="glass-card px-5 py-8 text-center">
        <p className="text-[13px] text-ink-muted">No active leads to rank yet.</p>
      </div>
    )
  }

  return (
    <div id="queue-top-five" className="space-y-2">
      {leads.map((lead, idx) => (
        <QueueLeadRow key={lead.id} lead={lead} rank={idx + 1} onClick={onLeadClick} />
      ))}
    </div>
  )
}
