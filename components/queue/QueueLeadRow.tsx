"use client"

/**
 * QueueLeadRow — single unified row used everywhere on /queue.
 *
 * One visual language for the whole page:
 *   - Top-5 hero: pass `rank` 1..5 → renders a RankRibbon (top-3 get crown)
 *   - Grade-grouped sections below: no rank → renders a thin grade-colored
 *     side-stripe instead
 *
 * Three info lines, never wraps to a fourth — keeps row height tight (~78px):
 *   line 1 → name (bold)
 *   line 2 → company · activity hint  (separated by a soft middle-dot)
 *   line 3 → channel chip · Active Xm ago
 *
 * Right side: Est. Revenue tile + action button.
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

const GRADE_RING: Record<string, string> = {
  A: "ring-emerald-200/70",
  B: "ring-sky-200/70",
  C: "ring-orange-200/70",
  D: "ring-amber-200/70",
  E: "ring-rose-200/70",
  F: "ring-slate-200/70",
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
  const ring = isTopRanked ? GRADE_RING[lead.grade] ?? GRADE_RING.B : ""

  return (
    <button
      onClick={() => onClick(lead.id)}
      data-rank={rank ?? undefined}
      className={cn(
        "w-full glass-card text-left flex items-stretch gap-3 pl-0 pr-4 py-2.5 rounded-2xl overflow-hidden",
        "hover:translate-y-[-1px] transition-transform",
        "focus:outline-none focus:ring-2 focus:ring-sky-300/60",
        isTopRanked && `ring-1 ${ring}`,
      )}
    >
      {rank != null ? (
        <RankRibbon rank={rank} grade={lead.grade} />
      ) : (
        <span
          className={cn("w-1.5 self-stretch shrink-0", GRADE_STRIPE[lead.grade] ?? "bg-slate-300")}
          aria-hidden="true"
        />
      )}

      <AvatarCircle seed={lead.first_name ?? "?"} size="lg" className={cn("self-center", rank == null && "ml-2")} />

      {/* Identity stack — 3 fixed lines, no wrap */}
      <div className="flex-1 min-w-0 self-center space-y-0.5">
        <p className="text-[14px] font-bold text-ink truncate leading-tight">{fullName}</p>
        <p className="text-[12px] text-slate-500 truncate leading-tight">
          <span className="font-medium text-ink-muted">{lead.company_name ?? "—"}</span>
          {hint && (
            <>
              <span className="text-slate-300 mx-1.5">·</span>
              <span>{hint}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-1.5 min-w-0 pt-0.5">
          <ChannelChip channel={channel} />
          <span className="text-[11px] text-slate-400 truncate">· Active {activeAgo(minAgo)}</span>
        </div>
      </div>

      {/* Est. revenue tile */}
      <div className="text-right shrink-0 self-center min-w-[88px] hidden sm:block px-1">
        <p className="text-[9px] uppercase tracking-[0.12em] text-ink-muted font-bold">Est. Revenue</p>
        <p className="text-[18px] font-extrabold text-ink tabular-nums leading-tight mt-0.5">{formatRupee(expValue)}</p>
      </div>

      {/* Action */}
      <div className="shrink-0 self-center pl-1">
        <span
          className={cn(
            "inline-flex items-center justify-center h-9 px-5 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap",
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
