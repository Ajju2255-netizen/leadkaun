import { cn } from "@/lib/utils"

type Props = {
  /** Rendered height in px (the lockup keeps its natural aspect ratio). */
  height?: number
  className?: string
  title?: string
}

/**
 * Leadkaun full logo — the blue→orange "A" mark with the focus dot, locked up
 * with the multicolour LEADKAUN wordmark. Artwork lives in
 * /public/brand/leadkaun-logo-horizontal.png (transparent). Use LeadkaunMark
 * when only the icon is needed.
 */
export function LeadkaunLogo({ height = 28, className, title = "Leadkaun" }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/leadkaun-logo-horizontal.png"
      alt={title}
      draggable={false}
      style={{ height, width: "auto" }}
      className={cn("shrink-0 select-none", className)}
    />
  )
}
