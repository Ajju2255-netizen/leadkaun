import { cn } from "@/lib/utils"

const FILL_COLORS: Record<string, string> = {
  fit:     "bg-gradient-to-r from-blue-400 to-blue-600",
  intent:  "bg-gradient-to-r from-emerald-400 to-emerald-600",
  quality: "bg-gradient-to-r from-violet-400 to-violet-600",
  default: "bg-gradient-to-r from-indigo-400 to-indigo-600",
}

interface Props {
  value:      number        // 0–100
  label?:     string
  type?:      "fit" | "intent" | "quality" | "default"
  showValue?: boolean
  className?: string
}

export function ScoreBar({ value, label, type = "default", showValue = true, className }: Props) {
  const clamped = Math.max(0, Math.min(100, value))
  const fill    = FILL_COLORS[type]

  return (
    <div className={cn("space-y-1", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && <span className="font-semibold text-slate-700 tabular-nums">{clamped}</span>}
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
