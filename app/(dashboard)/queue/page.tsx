"use client"

import { useState } from "react"
import { useQueue } from "@/hooks/useQueue"
import { QueueCard } from "@/components/queue/QueueCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Zap } from "lucide-react"
import type { QueueLead } from "@/hooks/useQueue"

// Section definitions — order is the display order
const SECTIONS = [
  {
    grade:       "A",
    label:       "Call Now",
    emoji:       "🔥",
    description: "Highest intent — act immediately",
    bg:          "bg-green-50",
    border:      "border-green-200",
    header:      "text-green-800",
    defaultOpen: true,
  },
  {
    grade:       "B",
    label:       "Call Today",
    emoji:       "📞",
    description: "Good leads — don't let them cool",
    bg:          "bg-blue-50",
    border:      "border-blue-200",
    header:      "text-blue-800",
    defaultOpen: true,
  },
  {
    grade:       "C",
    label:       "Nurture",
    emoji:       "📩",
    description: "Send follow-up material",
    bg:          "bg-amber-50",
    border:      "border-amber-200",
    header:      "text-amber-800",
    defaultOpen: true,
  },
  {
    grade:       "D",
    label:       "Low Priority",
    emoji:       "⏳",
    description: "Revisit when capacity allows",
    bg:          "bg-gray-50",
    border:      "border-gray-200",
    header:      "text-gray-600",
    defaultOpen: false,
  },
  {
    grade:       "E",
    label:       "Drop",
    emoji:       "❌",
    description: "Not worth pursuing now",
    bg:          "bg-red-50",
    border:      "border-red-200",
    header:      "text-red-700",
    defaultOpen: false,
  },
]

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  return `₹${(v / 1_000).toFixed(0)}K`
}

interface SectionProps {
  grade:       string
  label:       string
  emoji:       string
  description: string
  bg:          string
  border:      string
  header:      string
  leads:       QueueLead[]
  totalValue:  number
  defaultOpen: boolean
}

function GradeSection({ grade: _grade, label, emoji, description, bg, border, header, leads, totalValue, defaultOpen }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (leads.length === 0) return null

  return (
    <div className={`rounded-xl border ${border} ${bg} overflow-hidden`}>
      {/* Section header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:brightness-95 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <div className="text-left">
            <p className={`text-[14px] font-bold ${header}`}>{label}</p>
            <p className={`text-[12px] ${header} opacity-70`}>{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {totalValue > 0 && (
            <span className={`text-[12px] font-semibold ${header} opacity-80`}>
              {formatValue(totalValue)}
            </span>
          )}
          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-bold ${header} bg-white/60`}>
            {leads.length}
          </span>
          <span className={`text-[12px] ${header} opacity-60`}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Cards */}
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {leads.map((lead) => (
            <QueueCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function QueuePage() {
  const { data, isLoading, error } = useQueue()

  const grouped    = data?.grouped ?? {}
  const summary    = data?.summary ?? []
  const totalLeads = data?.total ?? 0

  // Hot leads = A + B for the execution score bar
  const hotCount = (grouped["A"]?.length ?? 0) + (grouped["B"]?.length ?? 0)
  const hotValue = [
    ...(grouped["A"] ?? []),
    ...(grouped["B"] ?? []),
  ].reduce((s, l) => s + (l.expected_value ?? 0), 0)

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── Page heading ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Priority Queue</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          {isLoading
            ? "Loading…"
            : `${totalLeads} active lead${totalLeads === 1 ? "" : "s"} · sorted by priority`}
        </p>
      </div>

      {/* ── Hot leads summary banner ───────────────────────────────────────── */}
      {!isLoading && hotCount > 0 && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-green-700" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[13px] font-bold text-green-800">
                {hotCount} lead{hotCount > 1 ? "s" : ""} need your attention today
              </p>
              <p className="text-[12px] text-green-700 opacity-80">
                {hotValue > 0 ? `${formatValue(hotValue)} at stake · ` : ""}
                {grouped["A"]?.length ? `${grouped["A"].length} call now` : ""}
                {grouped["A"]?.length && grouped["B"]?.length ? " · " : ""}
                {grouped["B"]?.length ? `${grouped["B"].length} call today` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Grade distribution row ─────────────────────────────────────────── */}
      {!isLoading && summary.length > 0 && totalLeads > 0 && (
        <div className="flex gap-2 flex-wrap">
          {summary.filter((s) => s.count > 0).map((s) => (
            <div
              key={s.grade}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border ${s.action.color}`}
            >
              <span>{s.action.label.split(" ")[0]}</span>
              <span>Grade {s.grade}</span>
              <span className="font-bold">{s.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">
          Failed to load queue — please refresh.
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[160px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!isLoading && totalLeads === 0 && !error && (
        <div className="rounded-xl bg-white border border-slate-100 shadow-sm px-6 py-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-[14px] font-semibold text-slate-700">No active leads</p>
          <p className="text-[12px] text-slate-400 mt-1">
            Import leads or assign some to get started.
          </p>
        </div>
      )}

      {/* ── Grade sections ─────────────────────────────────────────────────── */}
      {!isLoading && totalLeads > 0 && (
        <div className="space-y-3">
          {SECTIONS.map((section) => (
            <GradeSection
              key={section.grade}
              {...section}
              leads={grouped[section.grade] ?? []}
              totalValue={(grouped[section.grade] ?? []).reduce(
                (s, l) => s + (l.expected_value ?? 0), 0
              )}
            />
          ))}
        </div>
      )}

    </div>
  )
}
