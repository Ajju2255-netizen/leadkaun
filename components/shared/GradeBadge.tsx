import { cn } from "@/lib/utils"

/*
 * Coastal Sunrise grade chips — gradient pills with gloss edges.
 *
 * The letter sits in a subtly tinted glass background; on hover the chip lifts
 * (handled by the parent card). Color semantics map to the Coastal Sunrise palette:
 *
 * A = mint    — hot, call now            (#10B981)
 * B = sky     — warm, follow up this week (#0EA5E9)
 * C = peach   — lukewarm, nurture          (#FB923C)
 * D = orange  — cold, light touch          (#F97316)
 * E = red     — at-risk / urgency reserved (#EF4444)
 * F = slate   — junk / unscored            (#94A3B8)
 */

const GRADE_STYLES: Record<string, { bg: string; text: string; ring: string; glow: string }> = {
  A: { bg: "bg-emerald-50",  text: "text-emerald-700", ring: "ring-emerald-200", glow: "rgba(16,185,129,0.22)" },
  B: { bg: "bg-sky-50",      text: "text-sky-700",     ring: "ring-sky-200",     glow: "rgba(14,165,233,0.22)" },
  C: { bg: "bg-orange-50",   text: "text-orange-600",  ring: "ring-orange-200",  glow: "rgba(251,146,60,0.22)" },
  D: { bg: "bg-orange-100",  text: "text-orange-700",  ring: "ring-orange-300",  glow: "rgba(249,115,22,0.22)" },
  E: { bg: "bg-red-50",      text: "text-red-700",     ring: "ring-red-200",     glow: "rgba(239,68,68,0.22)" },
  F: { bg: "bg-slate-100",   text: "text-slate-500",   ring: "ring-slate-200",   glow: "rgba(148,163,184,0.16)" },
}

const SIZE_CLASSES = {
  sm: "text-[10px] font-extrabold px-2   py-0.5 min-w-[20px] rounded-full tracking-tight",
  md: "text-[11px] font-bold       px-2.5 py-0.5 min-w-[24px] rounded-full tracking-tight",
  lg: "text-[13px] font-bold       px-3   py-1   min-w-[30px] rounded-full tracking-tight",
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
        "inline-flex items-center justify-center leading-none ring-1",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
        style.bg,
        style.text,
        style.ring,
        SIZE_CLASSES[size],
        className,
      )}
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 4px ${style.glow}` }}
    >
      {grade}
    </span>
  )
}
