import { cn } from "@/lib/utils"

/*
 * Coastal Sunrise score bars — thin (5px) gradient fills.
 *
 * Each fill is a subtle 2-stop vertical gradient that catches light at the top.
 * Single-color reads cleanly at this size; gradient adds just enough dimension.
 *
 * Colour semantics:
 *   fit     = sky    (calculated/ICP match — the calm one)
 *   intent  = mint   (engagement — growth / positive)
 *   quality = cyan   (data structural — the cool data accent)
 */
const FILL: Record<string, string> = {
  fit:     "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)",
  intent:  "linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)",
  quality: "linear-gradient(180deg, #67E8F9 0%, #06B6D4 100%)",
  default: "linear-gradient(180deg, #475569 0%, #0F172A 100%)",
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
          {label    && <span className="text-[11px] text-ink-soft font-medium">{label}</span>}
          {showValue && <span className="text-[11px] font-semibold text-ink tabular-nums">{clamped}</span>}
        </div>
      )}
      <div
        className="h-[5px] w-full rounded-full overflow-hidden"
        style={{ background: "rgba(15,23,42,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${clamped}%`, background: fill }}
        />
      </div>
    </div>
  )
}
