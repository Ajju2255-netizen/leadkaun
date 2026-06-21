"use client"

/**
 * RankRibbon — numbered ranking badge for ordered lists (Top-N surfaces).
 *
 * Ranks 1–3 are decorated:
 *   - gradient tinted by grade (mint = A, sky = B, peach = C, slate = D/E)
 *   - small crown icon above the number
 * Ranks 4+ render as a plain slate ribbon.
 *
 * Future-proof: pass any rank — even 99 — and it won't crash. The crown
 * threshold is a single named constant.
 */

import { Crown } from "lucide-react"
import { cn } from "@/lib/utils"

const CROWN_THRESHOLD = 3

const GRADE_GRADIENT: Record<string, string> = {
  A: "linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)", // mint / emerald
  B: "linear-gradient(180deg, #C4B5FD 0%, #8B5CF6 100%)", // violet — design-system sky-tinted
  C: "linear-gradient(180deg, #FDBA74 0%, #FB923C 100%)", // peach
  D: "linear-gradient(180deg, #FB923C 0%, #F97316 100%)", // orange
  E: "linear-gradient(180deg, #F87171 0%, #DC2626 100%)", // red
  F: "linear-gradient(180deg, #CBD5E1 0%, #94A3B8 100%)", // slate
}

const PLAIN_GRADIENT = "linear-gradient(180deg, #F1F5F9 0%, #CBD5E1 100%)"

export interface RankRibbonProps {
  rank: number
  /** Lead grade letter — used only for top-3 to colour the ribbon. */
  grade?: string | null
  className?: string
}

export function RankRibbon({ rank, grade, className }: RankRibbonProps) {
  const decorated = rank <= CROWN_THRESHOLD
  const bg = decorated && grade && GRADE_GRADIENT[grade]
    ? GRADE_GRADIENT[grade]
    : decorated
      ? GRADE_GRADIENT.B  // default to violet for top-3 with unknown grade
      : PLAIN_GRADIENT

  return (
    <div
      className={cn(
        "relative w-10 shrink-0 flex flex-col items-center pt-1.5 pb-2 rounded-b-md text-white font-bold",
        decorated ? "text-white" : "text-slate-600",
        className,
      )}
      style={{
        background: bg,
        boxShadow:  decorated
          ? "inset 0 1px 0 rgba(255,255,255,0.55), 0 4px 10px rgba(15,23,42,0.15)"
          : "inset 0 1px 0 rgba(255,255,255,0.65)",
        clipPath:   "polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)",
      }}
      aria-label={`Rank ${rank}`}
    >
      {decorated && <Crown className="w-3.5 h-3.5 mb-0.5 opacity-90" />}
      <span className={cn("tabular-nums", decorated ? "text-[16px]" : "text-[13px]")}>{rank}</span>
    </div>
  )
}
