"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Radio, Sparkles } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeadSource {
  id:              string
  name:            string
  key:             string
  intent_baseline: number
  is_custom:       boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function intentColor(v: number): string {
  if (v >= 65) return "text-emerald-600 bg-emerald-50 border-emerald-100"
  if (v >= 45) return "text-sky-600 bg-sky-50 border-sky-100"
  if (v >= 25) return "text-amber-600 bg-amber-50 border-amber-100"
  return "text-slate-500 bg-slate-50 border-slate-100"
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const qc                        = useQueryClient()
  const [name,     setName]       = useState("")
  const [baseline, setBaseline]   = useState("30")
  const [adding,   setAdding]     = useState(false)
  const [showForm, setShowForm]   = useState(false)

  const { data, isLoading } = useQuery<{ data: { sources: LeadSource[] } }>({
    queryKey: ["lead-sources"],
    queryFn:  async () => {
      const res = await fetch("/api/lead-sources", { credentials: "include" })
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const sources  = data?.data?.sources ?? []
  const defaults = sources.filter((s) => !s.is_custom)
  const custom   = sources.filter((s) => s.is_custom)

  async function handleAdd() {
    if (!name.trim() || adding) return
    setAdding(true)
    const res = await fetch("/api/lead-sources", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: name.trim(), intent_baseline: parseInt(baseline) || 30 }),
    })
    setAdding(false)
    if (res.ok) {
      toast.success(`Source "${name.trim()}" added`)
      setName("")
      setBaseline("30")
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ["lead-sources"] })
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Failed to add source")
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)] shrink-0">
            <Radio className="w-6 h-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight">Lead Sources</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              Where your leads come from. Intent baseline affects initial scoring.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((o) => !o)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-sky-600 hover:bg-sky-700
                     text-white text-[12px] font-semibold transition-all active:scale-[0.97] shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add source
        </button>
      </div>

      {/* ── Add form ────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="glass-card px-5 py-4 space-y-3">
          <p className="section-label">New custom source</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-600">Source name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="e.g. LinkedIn Outreach"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px]
                           text-slate-900 placeholder:text-slate-300 focus:outline-none
                           focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all"
              />
            </div>
            <div className="w-28 space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-600">Intent baseline</label>
              <input
                type="number" min={0} max={100}
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px]
                           text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                           focus:border-sky-400 transition-all"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!name.trim() || adding}
              className="h-10 px-5 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50
                         text-white text-[13px] font-semibold transition-all shrink-0"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Intent baseline (0–100): higher = more intent assumed for leads from this source.
          </p>
        </div>
      )}

      {/* ── Custom sources ──────────────────────────────────────────────── */}
      {custom.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              <p className="section-label">Custom sources</p>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {custom.map((src) => (
              <SourceRow key={src.id} src={src} />
            ))}
          </div>
        </div>
      )}

      {/* ── Default sources ─────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-slate-400" />
            <p className="section-label">Default sources</p>
          </div>
        </div>
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {defaults.map((src) => (
              <SourceRow key={src.id} src={src} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Source Row ────────────────────────────────────────────────────────────────

function SourceRow({ src }: { src: LeadSource }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-900 leading-snug">{src.name}</p>
        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{src.key}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-bold tabular-nums ${intentColor(src.intent_baseline)}`}>
          {src.intent_baseline} intent
        </span>
        {src.is_custom && (
          <span className="text-[10px] font-semibold text-sky-500 bg-sky-50 border border-sky-100
                           px-2 py-0.5 rounded-full">
            custom
          </span>
        )}
      </div>
    </div>
  )
}
