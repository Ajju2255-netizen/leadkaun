import { cn } from "@/lib/utils"

/*
 * Score bars: thin (5px), single-colour fills — no gradients.
 * Gradient would add noise; single colour reads cleanly in a 3-bar row.
 *
 * Colour semantics:
 *   fit     = blue  (calculated/ICP match — "cold" data)
 *   intent  = green (engagement — "warm" signal)
 *   quality = violet (data completeness — "structural")
 */
const FILL: Record<string, string> = {
  fit:     "bg-blue-500",
  intent:  "bg-emerald-500",
  quality: "bg-violet-500",
  default: "bg-indigo-500",
}

interface Props {
  value:      number   // 0–100
  label?:     string
  type?:      "fit" | "intent" | "quality" | "default"
  showValue?: boolean
  className?: string
}

export function ScoreBar({
  value,
  label,
  type = "default",
  showValue = true,
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value))
  const fill    = FILL[type] ?? FILL.default

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label    && <span className="text-[11px] text-slate-400 font-medium">{label}</span>}
          {showValue && <span className="text-[11px] font-semibold text-slate-600 tabular-nums">{clamped}</span>}
        </div>
      )}
      <div className="h-[5px] w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
