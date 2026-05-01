import { useId } from "react"
import { cn } from "@/lib/utils"

type Props = {
  size?: number
  className?: string
  title?: string
  /** Renders the glyph in sky-500 on a transparent square (use on solid blue backgrounds) */
  inverted?: boolean
  /** Adds the sky gradient + 1px inner top white highlight (the brand-glossy variant) */
  gloss?: boolean
}

/**
 * Leadkaun brand mark — rounded square + monoline "A" glyph.
 * The "A" references the top grade in the A–F lead-grading system.
 * Mirrors the marketing site: app/components/leadkaun-mark.tsx (in leadkaun-marketing).
 */
export function LeadkaunMark({
  size = 22,
  className,
  title = "Leadkaun",
  inverted = false,
  gloss = false,
}: Props) {
  const reactId = useId()
  const id = `lk-mark-${reactId.replace(/[^a-zA-Z0-9-]/g, "")}`

  const fill = inverted
    ? "transparent"
    : gloss
    ? `url(#${id}-grad)`
    : "var(--sky-500)"

  const strokeColor = inverted ? "var(--sky-500)" : "#FFFFFF"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <title>{title}</title>
      {gloss && !inverted && (
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
          <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="rgba(255,255,255,0.45)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
      )}
      <rect
        x="0"
        y="0"
        width="40"
        height="40"
        rx="8"
        ry="8"
        fill={fill}
        stroke={inverted ? "var(--sky-500)" : "none"}
        strokeWidth={inverted ? 2 : 0}
      />
      {gloss && !inverted && (
        <rect x="0" y="0" width="40" height="40" rx="8" ry="8" fill={`url(#${id}-gloss)`} />
      )}
      <path
        d="M12 31 L20 9 L28 31 M15.3 24 L24.7 24"
        stroke={strokeColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
