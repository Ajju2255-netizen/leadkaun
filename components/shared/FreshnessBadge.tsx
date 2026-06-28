import { Clock } from "lucide-react"
import { computeFreshness, type FreshnessInput } from "@/lib/scoring/freshness"

const TONE: Record<string, string> = {
  fresh:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  recent: "bg-sky-50 text-sky-700 border-sky-200",
  aging:  "bg-amber-50 text-amber-700 border-amber-200",
  stale:  "bg-orange-50 text-orange-700 border-orange-200",
  cold:   "bg-rose-50 text-rose-700 border-rose-200",
}

function ageText(days: number): string {
  if (days < 1) return "today"
  if (days < 30) return `${days}d old`
  if (days < 365) return `${Math.round(days / 30)}mo old`
  const yrs = days / 365
  return `${yrs < 2 ? yrs.toFixed(1) : Math.round(yrs)}yr old`
}

/**
 * Data-freshness badge — how current the lead's data is. Uses the captured
 * source-collection date when available, else the import date.
 */
export function FreshnessBadge({ lead }: { lead: FreshnessInput }) {
  const f = computeFreshness(lead)
  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[f.band] ?? TONE.recent}`}>
        <Clock className="w-3 h-3" />
        {f.label} · {ageText(f.ageDays)}
        {!f.fromSource && <span className="font-normal opacity-70"> (by import date)</span>}
      </span>
      <span className="text-[11px] text-slate-400">{f.note}</span>
    </div>
  )
}
