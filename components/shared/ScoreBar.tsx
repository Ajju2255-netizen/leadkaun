import { cn } from "@/lib/utils"

const TRACK_COLORS: Record<string, string> = {
  fit:     "bg-blue-500",
  intent:  "bg-green-500",
  quality: "bg-purple-500",
  default: "bg-primary",
}

interface Props {
  value:     number        // 0–100
  label?:    string
  type?:     "fit" | "intent" | "quality" | "default"
  showValue?: boolean
  className?: string
}

export function ScoreBar({ value, label, type = "default", showValue = true, className }: Props) {
  const clamped = Math.max(0, Math.min(100, value))
  const fill    = TRACK_COLORS[type]

  return (
    <div className={cn("space-y-1", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label && <span>{label}</span>}
          {showValue && <span className="font-medium tabular-nums">{clamped}</span>}
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
