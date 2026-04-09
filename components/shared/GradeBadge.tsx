import { cn } from "@/lib/utils"

const GRADE_STYLES: Record<string, string> = {
  A: "bg-green-600  text-white",
  B: "bg-blue-600   text-white",
  C: "bg-amber-500  text-white",
  D: "bg-orange-600 text-white",
  E: "bg-red-600    text-white",
  F: "bg-slate-400  text-white",
}

interface Props {
  grade:      string
  size?:      "sm" | "md" | "lg"
  className?: string
}

export function GradeBadge({ grade, size = "md", className }: Props) {
  const styles = GRADE_STYLES[grade] ?? GRADE_STYLES["F"]

  const sizeClasses = {
    sm: "text-xs   px-1.5 py-0.5 min-w-[1.5rem]  rounded",
    md: "text-sm   px-2   py-0.5 min-w-[1.75rem] rounded-md",
    lg: "text-base px-3   py-1   min-w-[2.25rem] rounded-md",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold leading-none",
        styles,
        sizeClasses[size],
        className,
      )}
    >
      {grade}
    </span>
  )
}
