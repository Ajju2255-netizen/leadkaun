"use client"

import { useQuery } from "@tanstack/react-query"
import { TrendingUp, TrendingDown } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"

type TimelineEvent = {
  id: string
  kind: "CREATED" | "ENRICHED" | "ACTIVITY" | "GRADE_CHANGE" | "WON" | "LOST"
  occurred_at: string
  summary: string
  grade: "A" | "B" | "C" | "D" | "E" | "F"
  confidence: number
}

const KIND_DOT: Record<string, string> = {
  CREATED:      "bg-slate-400",
  ENRICHED:     "bg-violet-500",
  ACTIVITY:     "bg-sky-500",
  GRADE_CHANGE: "bg-amber-500",
  WON:          "bg-emerald-500",
  LOST:         "bg-rose-500",
}
const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export function ScoreTimeline({ leadId }: { leadId: string }) {
  const { data, isLoading, isError } = useQuery<{ events: TimelineEvent[] }>({
    queryKey: ["lead-timeline", leadId],
    queryFn: async () => {
      const r = await fetch(`/api/leads/${leadId}/timeline`)
      if (!r.ok) throw new Error("Failed to load timeline")
      return r.json()
    },
  })

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
  if (isError)  return <p className="text-[12px] text-rose-500">Couldn&apos;t load the score history.</p>

  const events = data?.events ?? []
  if (events.length === 0) {
    return (
      <p className="text-[12px] text-slate-400 leading-relaxed">
        No score history yet — it builds as you enrich this lead and log activity. Each change to grade or confidence appears here with the reason.
      </p>
    )
  }

  return (
    <div className="relative">
      {events.map((e, i) => {
        const prev = events[i - 1]
        const gradeDelta = prev ? GRADE_ORDER[e.grade] - GRADE_ORDER[prev.grade] : 0
        const confDelta  = prev ? e.confidence - prev.confidence : 0
        const isLast = i === events.length - 1
        return (
          <div key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && <div className="absolute left-[5px] top-4 bottom-0 w-px bg-slate-200" />}
            <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white ${KIND_DOT[e.kind] ?? "bg-slate-400"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-slate-400 tabular-nums">{fmtDate(e.occurred_at)}</span>
                <GradeBadge grade={e.grade} size="sm" />
                <span className="text-[12px] font-semibold text-slate-500 tabular-nums">{e.confidence}%</span>
                {gradeDelta !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${gradeDelta > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {gradeDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    grade
                  </span>
                )}
                {confDelta !== 0 && (
                  <span className={`text-[11px] font-semibold tabular-nums ${confDelta > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {confDelta > 0 ? "+" : ""}{confDelta}% conf
                  </span>
                )}
              </div>
              <p className="text-[13px] text-slate-700 mt-0.5">{e.summary}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
