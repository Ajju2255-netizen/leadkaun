import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * DeltaChip — period-over-period change indicator.
 *
 * Shared so the zero/empty rule is consistent app-wide (audit B3): a 0% change
 * (or no prior period) renders NEUTRAL — grey "—", no arrow, no colour. Only a
 * genuine non-zero delta shows a green/red arrow. This kills the "+0% green
 * up-arrow" and stray "-100%" noise that appeared on empty/seed data.
 *
 * `invert` flips good/bad (e.g. "Lost Deals" going up is bad).
 */
export function DeltaChip({
  delta,
  invert = false,
  className,
}: {
  delta?: number | null
  invert?: boolean
  className?: string
}) {
  if (delta === undefined || delta === null) return null

  if (delta === 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-400", className)}>
        <Minus className="w-3 h-3" />
        0%
      </span>
    )
  }

  const up   = delta > 0
  const good = invert ? !up : up
  const Arrow = up ? TrendingUp : TrendingDown

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-bold", good ? "text-emerald-600" : "text-rose-500", className)}>
      <Arrow className="w-3 h-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  )
}
