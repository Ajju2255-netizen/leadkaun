"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Sparkles, Target, Clock, Layers, Users, Lock, ArrowRight, Brain } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

type Insight = {
  key: string
  title: string
  status: "ready" | "learning"
  headline?: string
  detail?: string
  items?: unknown[]
  cta?: { label: string; href: string }
  need?: string
}

type PerGrade = { grade: string; decided: number; winRate: number }
type CloseRow = { grade: string; medianDays: number; n: number }
type SegRow   = { segment: string; won: number; decided: number; winRate: number }
type RepRow   = { name: string; adoptionPct: number | null; conversionPct: number | null }
type LearningData = {
  maturity: { decided: number; leads_total: number; unlocked: number; total: number }
  insights: Insight[]
}

const ICONS: Record<string, typeof Target> = {
  calibration: Target, close_time: Clock, segments: Layers,
  icp_evolution: Sparkles, best_time: Clock, rep_coaching: Users,
}

async function fetchLearning(): Promise<LearningData> {
  const r = await fetch("/api/analytics/learning", { credentials: "include" })
  if (!r.ok) throw new Error("Failed to load")
  return r.json()
}

export default function LearningPage() {
  const { data, isLoading } = useQuery<LearningData>({ queryKey: ["learning"], queryFn: fetchLearning })
  const m = data?.maturity

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(139,92,246,0.3)] shrink-0">
          <Brain className="w-6 h-6 text-white" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Learning Engine</h1>
          <p className="text-[14px] text-slate-500 mt-1 leading-relaxed">
            {isLoading
              ? "Reading your account…"
              : m && m.unlocked === 0
                ? "Leadkaun is still learning your business — keep importing, working leads, and closing deals."
                : `Leadkaun is learning your business — ${m?.unlocked} of ${m?.total} patterns unlocked, from ${m?.leads_total} leads (${m?.decided} decided).`}
          </p>
        </div>
      </div>

      {/* Maturity bar */}
      {m && (
        <div className="glass-card px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-slate-600">Patterns unlocked</span>
            <span className="text-[12px] font-semibold text-violet-600 tabular-nums">{m.unlocked} / {m.total}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all" style={{ width: `${(m.unlocked / m.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Insights */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data?.insights.map((ins) => <InsightCard key={ins.key} insight={ins} />)}
        </div>
      )}
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = ICONS[insight.key] ?? Sparkles
  const learning = insight.status === "learning"

  return (
    <div className={`glass-card px-5 py-4 ${learning ? "opacity-75" : ""}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${learning ? "bg-slate-100" : "bg-violet-50"}`}>
          {learning ? <Lock className="w-3.5 h-3.5 text-slate-400" /> : <Icon className="w-3.5 h-3.5 text-violet-600" />}
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{insight.title}</span>
      </div>

      {learning ? (
        <div>
          <p className="text-[13px] font-semibold text-slate-500">Still learning</p>
          <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">Need {insight.need} to unlock this pattern.</p>
        </div>
      ) : (
        <div>
          <p className="text-[15px] font-bold text-slate-800 leading-snug">{insight.headline}</p>
          {insight.detail && <p className="text-[12px] text-slate-500 mt-1.5 leading-relaxed">{insight.detail}</p>}
          <InsightItems insight={insight} />
          {insight.cta && (
            <Link href={insight.cta.href} className="inline-flex items-center gap-1 mt-3 text-[12px] font-semibold text-violet-600 hover:text-violet-700">
              {insight.cta.label} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

const TONE_BAR: Record<string, string> = { violet: "bg-violet-400", emerald: "bg-emerald-400" }
function Bar({ pct, tone = "violet" }: { pct: number; tone?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex-1">
      <div className={`h-full rounded-full ${TONE_BAR[tone] ?? TONE_BAR.violet}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

function InsightItems({ insight }: { insight: Insight }) {
  const items = insight.items ?? []
  if (items.length === 0) return null

  if (insight.key === "calibration") {
    return (
      <div className="mt-3 space-y-1.5">
        {(items as PerGrade[]).map((g) => (
          <div key={g.grade} className="flex items-center gap-2">
            <span className="w-4 text-[11px] font-bold text-slate-500">{g.grade}</span>
            <Bar pct={g.winRate} tone="emerald" />
            <span className="w-16 text-right text-[11px] tabular-nums text-slate-500">{g.winRate}% · {g.decided}</span>
          </div>
        ))}
      </div>
    )
  }
  if (insight.key === "close_time") {
    return (
      <div className="mt-3 space-y-1">
        {(items as CloseRow[]).map((c) => (
          <div key={c.grade} className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-slate-600">{c.grade}-grade</span>
            <span className="tabular-nums text-slate-500">~{c.medianDays} days <span className="text-slate-300">({c.n})</span></span>
          </div>
        ))}
      </div>
    )
  }
  if (insight.key === "segments" || insight.key === "icp_evolution") {
    return (
      <div className="mt-3 space-y-1.5">
        {(items as SegRow[]).slice(0, 5).map((s) => (
          <div key={s.segment} className="flex items-center gap-2">
            <span className="w-24 text-[11px] font-semibold text-slate-600 truncate">{s.segment}</span>
            <Bar pct={s.winRate} />
            <span className="w-14 text-right text-[11px] tabular-nums text-slate-500">{s.winRate}% · {s.decided}</span>
          </div>
        ))}
      </div>
    )
  }
  if (insight.key === "rep_coaching") {
    return (
      <div className="mt-3 space-y-1">
        {(items as RepRow[]).slice(0, 6).map((r) => (
          <div key={r.name} className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-slate-600 truncate">{r.name}</span>
            <span className="tabular-nums text-slate-500">{r.adoptionPct ?? "—"}% adopt · {r.conversionPct ?? "—"}% conv</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}
