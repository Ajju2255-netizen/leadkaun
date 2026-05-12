"use client"

/**
 * QueueSidebar — left rail for the Priority Queue redesign.
 *
 * Composed of:
 *   - Header pill + "Priority Queue" title + AI-ranked sub-copy
 *   - PodiumIllustration
 *   - KPI tile (2 stats): High Priority count + Est. Revenue
 *   - "Focus on top 3 leads today" glass call-out
 *   - Shield + AI-scoring footer note
 *
 * Sticky on xl screens.
 */

import { Rocket, ShieldCheck, Sparkles, ArrowUp, ArrowDown } from "lucide-react"
import { PodiumIllustration } from "./PodiumIllustration"
import { formatRupee } from "@/lib/format"

export interface QueueSidebarKpis {
  high_priority_count:           number
  high_priority_count_pct_change: number | null
  est_revenue_potential:         number
}

export interface QueueSidebarProps {
  kpis?: QueueSidebarKpis | null
  loading?: boolean
}

export function QueueSidebar({ kpis, loading }: QueueSidebarProps) {
  const pct = kpis?.high_priority_count_pct_change ?? null
  const isUp = pct != null && pct >= 0

  return (
    <aside className="xl:sticky xl:top-3 space-y-5">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0
                        bg-gradient-to-br from-sky-400 to-sky-600
                        shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <Rocket className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-[22px] font-extrabold text-ink tracking-tight leading-tight">Priority Queue</h1>
          <p className="text-[12px] text-ink-muted mt-0.5 leading-relaxed">
            Your AI-ranked list of leads who are most likely to convert.
          </p>
        </div>
      </div>

      {/* Podium illustration */}
      <div className="px-2 -my-1">
        <PodiumIllustration className="w-full h-auto" />
      </div>

      {/* KPI tile — 2 stats */}
      <div className="glass-card px-4 py-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-semibold text-sky-700 leading-tight">High Priority<br />Leads</p>
          <div className="flex items-center gap-1.5 mt-2">
            <p className="text-[22px] font-bold text-ink tabular-nums leading-none">
              {loading ? "—" : (kpis?.high_priority_count ?? 0)}
            </p>
            {pct != null && (
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${isUp ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"}`}
              >
                {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                {Math.abs(pct)}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-ink-muted mt-1">vs last 7 days</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-500 leading-tight">Est. Revenue</p>
          <p className="text-[18px] font-bold text-ink tabular-nums mt-2 leading-none">
            {loading ? "—" : formatRupee(kpis?.est_revenue_potential ?? 0)}
          </p>
          <p className="text-[10px] text-ink-muted mt-1">Potential</p>
        </div>
      </div>

      {/* Focus call-out */}
      <div className="glass-card px-4 py-3.5 flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5
                        shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-[12px] text-slate-700 leading-relaxed">
          <span className="font-bold">Focus on top 3 leads</span> today
          <br />to maximize your conversions.
        </p>
      </div>

      {/* Shield footer */}
      <div className="flex items-start gap-2 px-1 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-ink-muted leading-relaxed">
          AI Scoring based on activity, intent and conversion probability.
        </p>
      </div>
    </aside>
  )
}
