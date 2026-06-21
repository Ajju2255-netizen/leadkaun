"use client"

/**
 * QueueHeroCard — the #1 lead rendered as the highlighted top row of the queue
 * table (not a separate floating card). Its top line shares QUEUE_GRID with the
 * rows below, so avatar / value / action all line up; an aligned action strip
 * underneath carries the Call / WhatsApp quick actions.
 */

import { AvatarCircle } from "@/components/shared/AvatarCircle"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { ContactActions } from "@/components/shared/ContactActions"
import { QUEUE_GRID } from "@/components/queue/QueueLeadRow"
import { formatRupee } from "@/lib/format"
import { Flame, ArrowUpRight, Clock } from "lucide-react"
import type { QueueLead } from "@/hooks/useQueue"

function activeAgo(minutes: number | null | undefined): string {
  if (minutes == null) return "—"
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export interface QueueHeroCardProps {
  lead: QueueLead
  onOpen: (leadId: string) => void
}

export function QueueHeroCard({ lead, onOpen }: QueueHeroCardProps) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead"
  const meta     = [lead.company_name, lead.city].filter(Boolean).join(" · ")
  const hint     = lead.activity_hint || lead.stage?.name || "New lead"
  const reason   = lead.next_action?.reason

  return (
    <div className="rounded-xl bg-sky-50/70 ring-1 ring-sky-200 overflow-hidden shadow-[0_1px_2px_rgba(14,165,233,0.08)]">
      {/* Top line — shares the row grid so it aligns with the list below */}
      <button onClick={() => onOpen(lead.id)} className={`group w-full text-left ${QUEUE_GRID} px-3 pt-3 pb-1.5`}>
        {/* 1 · marker */}
        <span className="flex justify-center">
          <Flame className="w-3.5 h-3.5 text-sky-500" strokeWidth={2.4} />
        </span>

        {/* 2 · avatar */}
        <AvatarCircle seed={lead.first_name ?? "?"} size="md" />

        {/* 3 · identity */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[14px] font-extrabold text-ink truncate group-hover:text-sky-700 transition-colors">{fullName}</p>
            <GradeBadge grade={lead.grade} size="sm" />
            <span className="shrink-0 rounded-full bg-sky-100 text-sky-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]">Call next</span>
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            <span className="font-medium text-ink-muted">{meta || "—"}</span>
            {hint && <> · {hint}</>}
            <span className="text-slate-300"> · </span>
            <span className="inline-flex items-center gap-0.5 align-middle"><Clock className="w-3 h-3" />{activeAgo(lead.active_minutes_ago)}</span>
          </p>
        </div>

        {/* 4 · value (hidden on mobile to give the name room) */}
        <p className="hidden sm:block text-right text-[13px] font-extrabold tabular-nums text-ink">
          {lead.expected_value ? formatRupee(lead.expected_value) : "—"}
        </p>

        {/* 5 · AI score (aligns with the action column) */}
        <span className="justify-self-end text-[11px] font-semibold text-ink-muted tabular-nums">
          AI {Math.round(lead.ai_score)}
        </span>
      </button>

      {/* Action strip */}
      <div className="px-3 pb-3 pt-0.5">
        {reason && <p className="text-[11px] text-slate-500 mb-2 truncate">{reason}</p>}
        <ContactActions
          leadId={lead.id}
          leadName={fullName}
          phone={lead.phone}
          variant="panel"
          trailing={
            <button
              onClick={() => onOpen(lead.id)}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full text-slate-500 text-[13px] font-semibold hover:bg-white/70 transition-all"
            >
              View <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          }
        />
      </div>
    </div>
  )
}
