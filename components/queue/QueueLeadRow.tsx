"use client"

/**
 * QueueLeadRow — one row of the priority-queue table.
 *
 * Uses the shared QUEUE_GRID column template so the rank, avatar, identity,
 * value and next-action line up into clean vertical columns down the whole
 * list (and align with the column header + the #1 focus row).
 */

import { AvatarCircle } from "@/components/shared/AvatarCircle"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { formatRupee } from "@/lib/format"
import type { QueueLead } from "@/hooks/useQueue"

/** Shared column grid: rank · avatar · identity · value · next-action.
 *  The value column is dropped on mobile (and its cell hidden with
 *  `hidden sm:block`) so the name has room on narrow screens. */
export const QUEUE_GRID =
  "grid grid-cols-[18px_36px_minmax(0,1fr)_auto] sm:grid-cols-[18px_36px_minmax(0,1fr)_72px_120px] items-center gap-2.5 sm:gap-3"

function activeAgo(minutes: number | null | undefined): string {
  if (minutes == null) return "—"
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export interface QueueLeadRowProps {
  lead: QueueLead
  onClick: (leadId: string) => void
  /** Shown as a small rank number in the first column when set. */
  rank?: number
}

export function QueueLeadRow({ lead, onClick, rank }: QueueLeadRowProps) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const action   = lead.next_action?.label ?? "View"
  const expValue = lead.expected_value ?? 0
  const hint     = lead.activity_hint ?? lead.stage?.name ?? "New lead"

  return (
    <button
      onClick={() => onClick(lead.id)}
      className={`group w-full text-left ${QUEUE_GRID} rounded-xl bg-white ring-1 ring-slate-100
                  hover:ring-sky-200 hover:bg-sky-50/40 px-3 py-2.5 transition-all
                  focus:outline-none focus:ring-2 focus:ring-sky-300/60`}
    >
      {/* 1 · rank */}
      <span className="text-center text-[12px] font-extrabold tabular-nums text-slate-300 group-hover:text-sky-400">
        {rank ?? ""}
      </span>

      {/* 2 · avatar */}
      <AvatarCircle seed={lead.first_name ?? "?"} size="md" />

      {/* 3 · identity (two lines, never wraps) */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[13px] font-bold text-ink truncate">{fullName}</p>
          <GradeBadge grade={lead.grade} size="sm" />
        </div>
        <p className="text-[11px] text-slate-400 truncate mt-0.5">
          <span className="font-medium text-ink-muted">{lead.company_name ?? "—"}</span>
          {hint && <> · {hint}</>}
          <span className="text-slate-300"> · </span>{activeAgo(lead.active_minutes_ago)}
        </p>
      </div>

      {/* 4 · value (hidden on mobile to give the name room) */}
      <p className="hidden sm:block text-right text-[13px] font-extrabold tabular-nums text-ink">
        {formatRupee(expValue)}
      </p>

      {/* 5 · next-action chip */}
      <span className="justify-self-end inline-flex items-center justify-center h-8 px-3.5 rounded-full text-[12px] font-semibold
                       border border-slate-200 text-slate-600 whitespace-nowrap max-w-full truncate
                       group-hover:border-sky-300 group-hover:text-sky-700 group-hover:bg-sky-50 transition-all">
        {action}
      </span>
    </button>
  )
}
