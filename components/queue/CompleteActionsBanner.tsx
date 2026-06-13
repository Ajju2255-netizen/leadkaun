"use client"

/**
 * CompleteActionsBanner — bottom CTA below the Top-5 ranked list.
 *
 * "Complete 3 actions today — unlock ₹X in potential revenue" with a
 * gradient "Start Now →" button that scrolls the user back to the top
 * of the Top-5 list and focuses the first row.
 */

import { Target, ArrowRight } from "lucide-react"
import { formatRupee } from "@/lib/format"

export interface CompleteActionsBannerProps {
  topThreeRevenue: number
}

export function CompleteActionsBanner({ topThreeRevenue }: CompleteActionsBannerProps) {
  function handleStart() {
    if (typeof document === "undefined") return
    const top = document.getElementById("queue-top-five")
    if (top) {
      top.scrollIntoView({ behavior: "smooth", block: "start" })
      const firstRow = top.querySelector('button[data-rank="1"]') as HTMLButtonElement | null
      firstRow?.focus()
    }
  }

  if (topThreeRevenue <= 0) return null

  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(199,210,254,0.7) 0%, rgba(196,181,253,0.55) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 14px rgba(99,102,241,0.18)",
      }}
    >
      <div className="w-10 h-10 rounded-xl bg-white/65 flex items-center justify-center shrink-0
                      shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        <Target className="w-5 h-5 text-indigo-600" strokeWidth={2.4} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-indigo-900 leading-tight">
          Complete 3 actions today
        </p>
        <p className="text-[12px] text-indigo-800/80 mt-0.5 leading-relaxed">
          You could unlock <span className="font-bold">{formatRupee(topThreeRevenue)}</span> in potential revenue.
        </p>
      </div>
      <button
        onClick={handleStart}
        className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-white text-[12px] font-bold
                   bg-gradient-to-br from-indigo-500 to-indigo-700 active:scale-[0.97] transition-all
                   shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_10px_rgba(79,70,229,0.35)]"
      >
        Start Now <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
    </div>
  )
}
