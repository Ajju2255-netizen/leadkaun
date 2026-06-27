"use client"

import { useState } from "react"
import { ChevronDown, Info } from "lucide-react"
import { buildScoreExplanation, type ScoreFactor, type ExplainInput } from "@/lib/scoring/explain"

const TONE: Record<string, { bar: string; text: string }> = {
  good: { bar: "bg-emerald-400", text: "text-emerald-600" },
  ok:   { bar: "bg-sky-400",     text: "text-sky-600" },
  weak: { bar: "bg-amber-400",   text: "text-amber-600" },
  none: { bar: "bg-slate-300",   text: "text-slate-400" },
}

function FactorRow({ f }: { f: ScoreFactor }) {
  const tone = TONE[f.tone] ?? TONE.none
  const pct = f.max > 0 ? Math.max(0, Math.min(100, (f.points / f.max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-28 shrink-0 text-[12px] text-slate-600">{f.label}</div>
      <div className="flex-1 h-[5px] rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
        {f.points}{f.max > 0 ? `/${f.max}` : ""}
      </div>
      <div className={`w-40 shrink-0 text-[11px] ${tone.text}`}>{f.note}</div>
    </div>
  )
}

/**
 * "Why this grade?" — expands the stored fit/quality breakdowns into per-factor
 * reasons plus a plain-English rationale. Accepts the lead record directly;
 * tolerates a missing breakdown (older leads) by showing the summary only.
 */
export function ScoreExplanation({ lead }: { lead: ExplainInput }) {
  const [open, setOpen] = useState(false)
  const exp = buildScoreExplanation(lead)

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-sky-600 transition-colors"
        aria-expanded={open}
      >
        <Info className="w-3.5 h-3.5" />
        Why this grade?
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-[12px] leading-relaxed text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
            {exp.summary}
          </p>

          {exp.breakdownMissing ? (
            <p className="text-[11px] text-slate-400">
              A detailed factor breakdown will appear the next time this lead is re-scored.
            </p>
          ) : (
            <>
              {exp.fit.factors.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Fit · {exp.fit.score}/100
                  </p>
                  {exp.fit.factors.map((f) => <FactorRow key={f.key} f={f} />)}
                </div>
              )}

              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Intent · {exp.intent.score}/100
                </p>
                <p className="text-[12px] text-slate-600 py-1">{exp.intent.note}</p>
              </div>

              {exp.quality.factors.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Quality · {exp.quality.score}/100
                  </p>
                  {exp.quality.factors.map((f) => <FactorRow key={f.key} f={f} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
