import { cn } from "@/lib/utils"

/*
 * Notion-database-style status chips.
 *
 * Psychology: coloured text on a lightly tinted bg is immediately readable
 * without being aggressive. The letter is the focal point — bold, clear,
 * surrounded by just enough tint to signal meaning.
 *
 * A = emerald (positive, safe, "go")
 * B = blue    (informational, qualified, "act soon")
 * C = amber   (caution, needs work, "watch")
 * D = orange  (risk, losing heat, "urgent")
 * E = red     (danger, near-lost, "critical")
 * F = slate   (neutral, unscored, "unknown")
 */
const GRADE_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  A: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  B: { bg: "bg-blue-50",    text: "text-blue-700",    ring: "ring-blue-200"    },
  C: { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200"   },
  D: { bg: "bg-orange-50",  text: "text-orange-700",  ring: "ring-orange-200"  },
  E: { bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-200"     },
  F: { bg: "bg-slate-100",  text: "text-slate-500",   ring: "ring-slate-200"   },
}

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 min-w-[20px] rounded",
  md: "text-[11px] px-2   py-0.5 min-w-[24px] rounded-md",
  lg: "text-[13px] px-2.5 py-1   min-w-[30px] rounded-md",
}

interface Props {
  grade:      string
  size?:      "sm" | "md" | "lg"
  className?: string
}

export function GradeBadge({ grade, size = "md", className }: Props) {
  const style = GRADE_STYLES[grade] ?? GRADE_STYLES["F"]

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold leading-none ring-1",
        style.bg,
        style.text,
        style.ring,
        SIZE_CLASSES[size],
        className,
      )}
    >
      {grade}
    </span>
  )
}
