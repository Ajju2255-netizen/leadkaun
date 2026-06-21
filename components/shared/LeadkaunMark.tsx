import { cn } from "@/lib/utils"

type Props = {
  /** Rendered height in px (the mark keeps its natural aspect ratio). */
  size?: number
  className?: string
  title?: string
  /** Kept for call-site compatibility — the full-colour brand mark works on
   *  both light and dark backgrounds, so these no longer change the render. */
  inverted?: boolean
  gloss?: boolean
}

/**
 * Leadkaun brand mark — the blue→orange "A" with the focus dot.
 * Source artwork lives in /public/brand/leadkaun-mark.png (transparent).
 */
export function LeadkaunMark({ size = 22, className, title = "Leadkaun" }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/leadkaun-mark.png"
      alt={title}
      draggable={false}
      style={{ height: size, width: "auto" }}
      className={cn("shrink-0 select-none", className)}
    />
  )
}
