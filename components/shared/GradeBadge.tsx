import { cn } from "@/lib/utils"

const GRADE_STYLES: Record<string, string> = {
  A: "bg-green-100  text-green-700  border-green-200",
  B: "bg-blue-100   text-blue-700   border-blue-200",
  C: "bg-yellow-100 text-yellow-700 border-yellow-200",
  D: "bg-orange-100 text-orange-700 border-orange-200",
  E: "bg-red-100    text-red-700    border-red-200",
  F: "bg-gray-100   text-gray-500   border-gray-200",
}

interface Props {
  grade:     string
  size?:     "sm" | "md" | "lg"
  className?: string
}

export function GradeBadge({ grade, size = "md", className }: Props) {
  const styles = GRADE_STYLES[grade] ?? GRADE_STYLES["F"]

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 min-w-[1.5rem]",
    md: "text-sm px-2    py-0.5 min-w-[1.75rem]",
    lg: "text-base px-3  py-1   min-w-[2.25rem]",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-bold leading-none",
        styles,
        sizeClasses[size],
        className,
      )}
    >
      {grade}
    </span>
  )
}
