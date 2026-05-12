"use client"

/**
 * QueueTopFive — the AI-ranked Top-N card list at the hero of /queue.
 *
 * Each row: RankRibbon + AvatarCircle + name/company/activity hint +
 * ChannelChip + "Active Xm ago" + AI Score + Est. Revenue + primary
 * action button (uses lead.next_action.label so it stays semantically
 * correct: "Call Now" / "Send Email" / "Send Message" / "Call Later").
 *
 * Designed for top-5 but supports any N (pass any slice). Empty state
 * inline.
 */

import { AvatarCircle } from "@/components/shared/AvatarCircle"
import { RankRibbon } from "@/components/shared/RankRibbon"
import { ChannelChip } from "@/components/shared/ChannelChip"
import { aiScoreBand } from "@/lib/scoring/ai-score"
import { formatRupee } from "@/lib/format"
import type { QueueLead } from "@/hooks/useQueue"
import { cn } from "@/lib/utils"

function activeAgo(minutes: number | null | undefined): string {
  if (minutes == null) return "—"
  if (minutes < 1)     return "just now"
  if (minutes < 60)    return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)      return `${hours}h ago`
  const days  = Math.floor(hours / 24)
  return `${days}d ago`
}

function aiScoreColor(score: number): string {
  switch (aiScoreBand(score)) {
    case "great": return "text-emerald-600"
    case "good":  return "text-sky-600"
    case "ok":    return "text-amber-600"
    default:      return "text-slate-500"
  }
}

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
    <div id="queue-top-five" className="space-y-3">
      {leads.map((lead, idx) => {
        const rank      = idx + 1
        const fullName  = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
        const aiScore   = lead.ai_score ?? 0
        const score     = aiScore
        const channel   = lead.channel ?? "website"
        const hint      = lead.activity_hint ?? lead.stage?.name ?? "New lead"
        const action    = lead.next_action?.label ?? "View"
        const minAgo    = lead.active_minutes_ago ?? null
        const expValue  = lead.expected_value ?? 0
        const isTop     = rank <= 3

        return (
          <button
            key={lead.id}
            onClick={() => onLeadClick(lead.id)}
            data-rank={rank}
            className={cn(
              "w-full glass-card text-left flex items-stretch gap-3 pl-0 pr-4 py-3.5",
              "hover:translate-y-[-1px] transition-transform",
              "focus:outline-none focus:ring-2 focus:ring-sky-300/60 rounded-2xl",
            )}
          >
            <RankRibbon rank={rank} grade={lead.grade} />

            <AvatarCircle seed={lead.first_name ?? "?"} size="md" className="my-1" />

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

            {/* AI Score */}
            <div className="text-right shrink-0 self-center min-w-[58px]">
              <p className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">AI Score</p>
              <p className={cn("text-[22px] font-extrabold tabular-nums leading-none mt-1", aiScoreColor(score))}>
                {score}
              </p>
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
                  isTop
                    ? "bg-sky-600 text-white shadow-[0_1px_2px_rgba(14,165,233,0.25),inset_0_1px_0_rgba(255,255,255,0.45)]"
                    : "border border-slate-200 text-slate-700 bg-white hover:bg-slate-50",
                )}
              >
                {action}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
