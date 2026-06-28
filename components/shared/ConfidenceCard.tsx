import { ShieldCheck, Sparkles, Plus } from "lucide-react"
import { computeConfidence, type ConfidenceInput } from "@/lib/scoring/confidence"

const BAND: Record<string, { bar: string; text: string; label: string }> = {
  high:     { bar: "bg-emerald-400", text: "text-emerald-700", label: "High confidence" },
  moderate: { bar: "bg-sky-400",     text: "text-sky-700",     label: "Moderate confidence" },
  low:      { bar: "bg-amber-400",   text: "text-amber-700",   label: "Low confidence" },
  very_low: { bar: "bg-rose-400",    text: "text-rose-700",    label: "Very low confidence" },
}

/**
 * Confidence meter + "Needs Enrichment" checklist. Confidence is separate from
 * the grade: it says how much we actually know, so a thin lead reads as
 * "not enough info yet" rather than "bad lead".
 */
export function ConfidenceCard({ lead }: { lead: ConfidenceInput }) {
  const c = computeConfidence(lead)
  const band = BAND[c.band] ?? BAND.moderate

  return (
    <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className={`w-3.5 h-3.5 ${band.text}`} />
          <span className="text-[12px] font-bold text-slate-700">Confidence</span>
          <span className={`text-[11px] font-semibold ${band.text}`}>· {band.label}</span>
        </div>
        <span className={`text-[15px] font-bold tabular-nums ${band.text}`}>{c.score}%</span>
      </div>

      <div className="mt-2 h-[6px] w-full rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${band.bar}`} style={{ width: `${c.score}%` }} />
      </div>

      {c.needsEnrichment ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[12px] font-bold text-amber-800">Needs Enrichment</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-700 leading-relaxed">{c.reason}</p>
          {c.missing.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.missing.map((m) => (
                <span
                  key={m.key}
                  title={m.hint}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                >
                  <Plus className="w-2.5 h-2.5" />
                  {m.label}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{c.reason}</p>
      )}
    </div>
  )
}
