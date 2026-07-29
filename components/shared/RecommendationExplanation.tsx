"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Sparkles, ThumbsUp, X } from "lucide-react"
import {
  buildRecommendationExplanation,
  type RecommendationExplainInput,
} from "@/lib/scoring/recommendation-explanation"
import { logRecommendationEvent } from "@/lib/analytics/recommendation-telemetry"

const BAND_STYLE: Record<string, string> = {
  high: "text-emerald-600 bg-emerald-50",
  moderate: "text-sky-600 bg-sky-50",
  low: "text-amber-600 bg-amber-50",
  very_low: "text-rose-600 bg-rose-50",
}

const SKIP_REASONS = [
  { key: "ALREADY_DOING_IT", label: "Already doing it" },
  { key: "WRONG_RECOMMENDATION", label: "Wrong recommendation" },
  { key: "NEED_MORE_INFO", label: "Need more information" },
  { key: "NOT_RELEVANT", label: "Not relevant" },
  { key: "OTHER", label: "Other" },
]

type Decision = "none" | "accepted" | "skipping" | "ignored"

/**
 * "Why did Leadkaun recommend this?" — the explanation layer + the interaction
 * funnel. Shows only engine-attributable evidence (never a generated
 * paragraph), and logs SHOWN / EXPANDED / ACCEPTED / IGNORED so we can measure
 * Recommendation Acceptance Rate and where recommendations fail.
 */
export function RecommendationExplanation({
  lead,
  action,
  leadId,
}: {
  lead: RecommendationExplainInput & { grade: string }
  action: { label: string; reason: string }
  leadId: string
}) {
  const [open, setOpen] = useState(false)
  const [decision, setDecision] = useState<Decision>("none")
  const shownLogged = useRef(false)
  const expandedLogged = useRef(false)

  const exp = buildRecommendationExplanation(lead, action)
  const base = {
    action_label: action.label,
    grade_at_event: lead.grade,
    confidence_band: exp.confidenceBand,
  }

  // SHOWN — once per mount (ref guards React StrictMode's double-invoke).
  useEffect(() => {
    if (shownLogged.current) return
    shownLogged.current = true
    logRecommendationEvent(leadId, "SHOWN", base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  function toggle() {
    setOpen((o) => {
      const next = !o
      if (next && !expandedLogged.current) {
        expandedLogged.current = true
        logRecommendationEvent(leadId, "EXPANDED", base)
      }
      return next
    })
  }

  function accept() {
    setDecision("accepted")
    logRecommendationEvent(leadId, "ACCEPTED", base)
  }

  function skip(reason: string) {
    setDecision("ignored")
    logRecommendationEvent(leadId, "IGNORED", { ...base, skip_reason: reason })
  }

  const bandStyle = BAND_STYLE[exp.confidenceBand] ?? BAND_STYLE.low

  return (
    <div className="glass-card px-5 py-4">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-sky-600 transition-colors"
        aria-expanded={open}
      >
        <Sparkles className="w-3.5 h-3.5" />
        Why did Leadkaun recommend this?
        <ChevronDown className={`ml-auto w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {/* Recommendation + rationale */}
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Recommendation</p>
            <p className="text-[13px] font-semibold text-slate-800">{exp.recommendation}</p>
            <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{exp.rationale}</p>
          </div>

          {/* Evidence — structured, attributable, never generated prose */}
          {exp.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Why</p>
              <ul className="space-y-1.5">
                {exp.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-700">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" strokeWidth={2.5} />
                    <span>{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Confidence</p>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${bandStyle}`}>
              {exp.confidenceLabel}
            </span>
          </div>

          {/* Missing information + what would strengthen it */}
          {exp.missing.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Missing information</p>
              <ul className="space-y-1">
                {exp.missing.map((m) => (
                  <li key={m} className="flex items-center gap-2 text-[12px] text-slate-500">
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    {m}
                  </li>
                ))}
              </ul>
              {exp.strongerIf && (
                <p className="text-[12px] text-slate-500 mt-2 leading-relaxed italic">{exp.strongerIf}</p>
              )}
            </div>
          )}

          {/* Honest limits */}
          {exp.cautions.map((c, i) => (
            <p key={i} className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
              {c}
            </p>
          ))}

          {/* ── Decision (telemetry) ─────────────────────────────────── */}
          <div className="border-t border-slate-100 pt-3">
            {decision === "none" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={accept}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-full px-3.5 py-1.5 transition-colors"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  Following this
                </button>
                <button
                  onClick={() => setDecision("skipping")}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-700 rounded-full px-3.5 py-1.5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Skip
                </button>
              </div>
            )}

            {decision === "skipping" && (
              <div>
                <p className="text-[12px] text-slate-500 mb-2">Why are you skipping this?</p>
                <div className="flex flex-wrap gap-1.5">
                  {SKIP_REASONS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => skip(r.key)}
                      className="text-[12px] text-slate-600 border border-slate-200 hover:border-sky-300 hover:text-sky-600 rounded-full px-3 py-1 transition-colors"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {decision === "accepted" && (
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600">
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                Marked as following — good luck with the call.
              </p>
            )}

            {decision === "ignored" && (
              <p className="text-[12px] text-slate-400">Thanks — noted. This helps Leadkaun get better.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
