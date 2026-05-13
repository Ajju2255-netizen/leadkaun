"use client"

/**
 * QueueLeadRow — single unified row used everywhere on /queue.
 *
 * One visual language for the whole page:
 *   - Top-5 hero: pass `rank` 1..5 → renders a RankRibbon (top-3 get crown)
 *   - Grade-grouped sections below: no rank → renders a thin grade-colored
 *     side-stripe instead
 *
 * Row content (identical in both modes):
 *   avatar → name / company / activity hint / channel chip + "Active Xm ago"
 *   → Est. Revenue (md+) → primary action button
 *
 * Deliberately no AI Score column — that signal stays internal (drives sort).
 */

import { AvatarCircle } from "@/components/shared/AvatarCircle"
import { RankRibbon } from "@/components/shared/RankRibbon"
import { ChannelChip } from "@/components/shared/ChannelChip"
import { formatRupee } from "@/lib/format"
import type { QueueLead } from "@/hooks/useQueue"
import { cn } from "@/lib/utils"

function activeAgo(minutes: number | null | undefined): string {
  if (minutes == null) return "—"
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const GRADE_STRIPE: Record<string, string> = {
  A: "bg-gradient-to-b from-emerald-300 to-emerald-500",
  B: "bg-gradient-to-b from-sky-300 to-sky-500",
  C: "bg-gradient-to-b from-orange-300 to-orange-500",
  D: "bg-gradient-to-b from-amber-300 to-amber-500",
  E: "bg-gradient-to-b from-rose-300 to-rose-500",
  F: "bg-gradient-to-b from-slate-300 to-slate-400",
}

export interface QueueLeadRowProps {
  lead: QueueLead
  onClick: (leadId: string) => void
  /** Top-5 only — when set, renders the rank ribbon. */
  rank?: number
}

export function QueueLeadRow({ lead, onClick, rank }: QueueLeadRowProps) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const action   = lead.next_action?.label ?? "View"
  const minAgo   = lead.active_minutes_ago ?? null
  const expValue = lead.expected_value ?? 0
  const channel  = lead.channel ?? "website"
  const hint     = lead.activity_hint ?? lead.stage?.name ?? "New lead"
  const isTopRanked = rank != null && rank <= 3

  return (
    <button
      onClick={() => onClick(lead.id)}
      data-rank={rank ?? undefined}
      className={cn(
        "w-full glass-card text-left flex items-stretch gap-3 pr-4 py-3.5",
        rank != null ? "pl-0" : "pl-0",
        "hover:translate-y-[-1px] transition-transform",
        "focus:outline-none focus:ring-2 focus:ring-sky-300/60 rounded-2xl",
      )}
    >
      {rank != null ? (
        <RankRibbon rank={rank} grade={lead.grade} />
      ) : (
        <span
          className={cn(
            "w-1.5 self-stretch rounded-l-2xl rounded-r-sm shrink-0",
            GRADE_STRIPE[lead.grade] ?? "bg-slate-300",
          )}
          aria-hidden="true"
        />
      )}

      <AvatarCircle seed={lead.first_name ?? "?"} size="md" className={cn(rank != null ? "my-1" : "ml-2 my-1")} />

      {/* Identity + activity */}
      <div className="flex-1 min-w-0 self-center">
        <p className="text-[14px] font-bold text-ink truncate">{fullName}</p>
        <p className="text-[12px] text-ink-muted truncate">{lead.company_name ?? "—"}</p>
        <p className="text-[12px] text-slate-500 truncate mt-0.5">{hint}</p>
        <div className="flex items-center gap-2 mt-1.5 min-w-0">
          <ChannelChip channel={channel} />
          <span className="text-[11px] text-slate-400 truncate">· Active {activeAgo(minAgo)}</span>
        </div>
      </div>

      {/* Est. revenue */}
      <div className="text-right shrink-0 self-center min-w-[80px] hidden md:block">
        <p className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">Est. Revenue</p>
        <p className="text-[14px] font-bold text-ink tabular-nums mt-1">{formatRupee(expValue)}</p>
      </div>

      {/* Action */}
      <div className="shrink-0 self-center">
        <span
          className={cn(
            "inline-flex items-center justify-center h-9 px-4 rounded-full text-[12px] font-semibold transition-all",
            isTopRanked
              ? "bg-sky-600 text-white shadow-[0_1px_2px_rgba(14,165,233,0.25),inset_0_1px_0_rgba(255,255,255,0.45)]"
              : "border border-slate-200 text-slate-700 bg-white hover:bg-slate-50",
          )}
        >
          {action}
        </span>
      </div>
    </button>
  )
}
