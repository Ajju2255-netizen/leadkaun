"use client"

/**
 * QueueLeadRow — one <tr> in the priority-queue data table (see queue/page.tsx).
 * Columns: Lead · Signal · Value · Grade · Next action · Source · Last active ·
 * open. The whole row opens the lead's slide-over (onClick) — behaviour unchanged.
 * `isNext` marks the top-priority lead with a small "Next" tag.
 */

import { AvatarCircle } from "@/components/shared/AvatarCircle"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { formatRupee } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import type { QueueLead } from "@/hooks/useQueue"

function activeAgo(minutes: number | null | undefined): string {
  if (minutes == null) return "—"
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Next-action pill tone, keyed off grade (the action derives from grade). */
const NEXT_TONE: Record<string, string> = {
  A: "bg-sky-50 text-sky-700",
  B: "bg-sky-50 text-sky-700",
  C: "bg-amber-50 text-amber-700",
  D: "bg-orange-50 text-orange-700",
  E: "bg-slate-100 text-slate-500",
  F: "bg-slate-100 text-slate-500",
}

export interface QueueLeadRowProps {
  lead: QueueLead
  onClick: (leadId: string) => void
  isNext?: boolean
}

export function QueueLeadRow({ lead, onClick, isNext }: QueueLeadRowProps) {
  const fullName  = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead"
  const company   = lead.company_name ?? "—"
  const signal    = lead.activity_hint || lead.inquiry_text || lead.stage?.name || "New lead"
  const nextLabel = lead.next_action?.label ?? "Review"
  const source    = lead.source?.name ?? "—"

  return (
    <tr
      onClick={() => onClick(lead.id)}
      className="group cursor-pointer transition-colors hover:bg-sky-50/40"
    >
      {/* Lead */}
      <td className="py-3 pl-5 pr-3 align-middle">
        <div className="flex items-center gap-3 min-w-0">
          <AvatarCircle seed={lead.first_name ?? "?"} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13.5px] font-semibold text-ink truncate group-hover:text-sky-700 transition-colors">
                {fullName}
              </span>
              {isNext && (
                <span className="shrink-0 inline-flex items-center h-[18px] px-1.5 rounded-full bg-sky-100 text-sky-700 text-[9px] font-bold uppercase tracking-[0.06em]">
                  Next
                </span>
              )}
            </div>
            <p className="text-[12px] text-ink-muted truncate mt-0.5">{company}</p>
          </div>
        </div>
      </td>

      {/* Signal */}
      <td className="py-3 px-3 align-middle hidden lg:table-cell">
        <p className="text-[13px] text-ink-soft truncate max-w-[220px]">{signal}</p>
      </td>

      {/* Value */}
      <td className="py-3 px-3 align-middle text-right">
        <span className="text-[13.5px] font-semibold tabular-nums text-ink">
          {lead.expected_value ? formatRupee(lead.expected_value) : "—"}
        </span>
      </td>

      {/* Grade */}
      <td className="py-3 px-3 align-middle">
        <GradeBadge grade={lead.grade} size="md" />
      </td>

      {/* Next action */}
      <td className="py-3 px-3 align-middle hidden sm:table-cell">
        <span className={cn("inline-flex items-center h-7 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap", NEXT_TONE[lead.grade] ?? NEXT_TONE.F)}>
          {nextLabel}
        </span>
      </td>

      {/* Source */}
      <td className="py-3 px-3 align-middle hidden xl:table-cell">
        <span className="text-[12.5px] text-ink-muted whitespace-nowrap">{source}</span>
      </td>

      {/* Last active */}
      <td className="py-3 px-3 align-middle hidden lg:table-cell">
        <span className="text-[12.5px] text-ink-muted whitespace-nowrap">{activeAgo(lead.active_minutes_ago)}</span>
      </td>

      {/* Open */}
      <td className="py-3 pl-3 pr-5 align-middle text-right">
        <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg text-slate-300 group-hover:text-sky-600 group-hover:bg-sky-50 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </span>
      </td>
    </tr>
  )
}
