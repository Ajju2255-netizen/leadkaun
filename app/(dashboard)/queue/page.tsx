"use client"

/*
 * Priority Queue page.
 *
 * Design intent:
 *   The queue is the rep's daily cockpit — the one place they come to know
 *   exactly what to do next. The execution score bar at the top provides
 *   instant motivation (progress = completion). As the bar fills, the rep
 *   gets a sense of daily accomplishment — Zeigarnik effect working in our
 *   favour.
 *
 *   Empty state is kept positive ("queue is clear") not neutral ("no leads"),
 *   because clearing the queue IS the win.
 */

import { useQueue } from "@/hooks/useQueue"
import { QueueCard } from "@/components/queue/QueueCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Zap } from "lucide-react"

export default function QueuePage() {
  const { data, isLoading, error } = useQueue()

  const leads     = data?.leads ?? []
  const actioned  = leads.filter((l) => l.followups_due === 0).length
  const execScore = leads.length > 0 ? Math.round((actioned / leads.length) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* ── Page heading ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Priority Queue</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          {data ? `${data.total} lead${data.total === 1 ? "" : "s"} ranked by score` : "Loading your queue…"}
        </p>
      </div>

      {/* ── Daily Execution Score ─────────────────────────────────────────── */}
      {leads.length > 0 && (
        <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2.5} />
              </div>
              <span className="text-[13px] font-semibold text-slate-700">Daily Execution Score</span>
            </div>
            <span className="text-[13px] font-bold text-slate-800 tabular-nums">{execScore}%</span>
          </div>

          {/* Progress track */}
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${execScore}%` }}
            />
          </div>

          <p className="text-[11px] text-slate-400 mt-2">
            {actioned} of {leads.length} leads actioned today
          </p>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">
          Failed to load queue — please refresh the page.
        </div>
      )}

      {/* ── Loading skeletons ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[168px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!isLoading && leads.length === 0 && !error && (
        <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] px-6 py-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-[14px] font-semibold text-slate-700">Queue is clear</p>
          <p className="text-[12px] text-slate-400 mt-1">All leads are actioned. Great work!</p>
        </div>
      )}

      {/* ── Queue cards ───────────────────────────────────────────────────── */}
      {!isLoading && leads.length > 0 && (
        <div className="space-y-3">
          {leads.map((lead) => (
            <QueueCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

    </div>
  )
}
