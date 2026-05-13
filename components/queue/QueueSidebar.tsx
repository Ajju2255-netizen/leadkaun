"use client"

/**
 * QueueSidebar — left rail. Tightened pass: bigger KPI numbers, podium
 * sized to match column width, no extra callouts (Top-5 ribbons already
 * communicate the "focus on top 3" message). Sticky on xl.
 */

import { Rocket, ShieldCheck, ArrowUp, ArrowDown, TrendingUp } from "lucide-react"
import { PodiumIllustration } from "./PodiumIllustration"
import { formatRupee } from "@/lib/format"

export interface QueueSidebarKpis {
  high_priority_count:            number
  high_priority_count_pct_change: number | null
  est_revenue_potential:          number
}

export interface QueueSidebarProps {
  kpis?: QueueSidebarKpis | null
  loading?: boolean
}

export function QueueSidebar({ kpis, loading }: QueueSidebarProps) {
  const pct = kpis?.high_priority_count_pct_change ?? null
  const isUp = pct != null && pct >= 0

  return (
    <aside className="xl:sticky xl:top-3 space-y-4">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0
                        bg-gradient-to-br from-sky-400 to-sky-600
                        shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <Rocket className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-[22px] font-extrabold text-ink tracking-tight leading-none">Priority Queue</h1>
          <p className="text-[12px] text-ink-muted mt-1 leading-snug">
            Your ranked list of leads<br />most likely to convert.
          </p>
        </div>
      </div>

      {/* Podium illustration — flush, no extra padding */}
      <PodiumIllustration className="w-full h-auto -my-2" />

      {/* Hero KPI — stacked, big number */}
      <div className="glass-card px-4 py-4">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-700">High Priority</p>
          {pct != null && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto
                ${isUp ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"}`}
            >
              {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
              {Math.abs(pct)}%
            </span>
          )}
        </div>
        <p className="text-[36px] font-extrabold text-ink tabular-nums leading-none mt-2">
          {loading ? "—" : (kpis?.high_priority_count ?? 0)}
        </p>
        <p className="text-[11px] text-ink-muted mt-1.5">leads · vs last 7 days</p>

        <div className="h-px bg-slate-100 my-3.5" />

        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3 text-slate-400" />
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Est. Revenue</p>
        </div>
        <p className="text-[26px] font-extrabold text-ink tabular-nums leading-none mt-2">
          {loading ? "—" : formatRupee(kpis?.est_revenue_potential ?? 0)}
        </p>
        <p className="text-[11px] text-ink-muted mt-1.5">potential this week</p>
      </div>

      {/* Shield footer */}
      <div className="flex items-start gap-2 px-1 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-ink-muted leading-snug">
          Ranked by activity, intent and conversion probability.
        </p>
      </div>
    </aside>
  )
}
