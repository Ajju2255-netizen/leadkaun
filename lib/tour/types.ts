import type { UserRole } from "@prisma/client"

/** Matches an element carrying `data-tour="<anchor>"`. */
export type TourAnchor = string

export type TourStep = {
  /** Stable across content edits. Used for resume and for telemetry. */
  id: string
  /** Shown small above the title, so people know how far in they are. */
  chapter: string
  /** The pathname this step belongs on. The engine navigates if needed. */
  route: string
  /** Omit for a centred card with no cutout, e.g. an opening or closing step. */
  anchor?: TourAnchor
  title: string
  body: string
  /** Which roles see it. Absent means everyone. */
  roles?: UserRole[]
  /**
   * What to do on a phone. Sidebar anchors have no on screen element below md,
   * where the nav is a drawer, so those centre instead of pointing at nothing.
   */
  mobile?: "anchor" | "center"
  /** Only meaningful while the sample workspace is active. */
  requiresSample?: boolean
}
