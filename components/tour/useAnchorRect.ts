"use client"

import { useEffect, useState } from "react"

export type Rect = { top: number; left: number; width: number; height: number }

const FIND_TIMEOUT_MS = 3000

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * Follows the element a tour step is pointing at.
 *
 * Three things make this harder than reading getBoundingClientRect once.
 *
 * The anchor often does not exist yet. Pages here fetch through react query, so
 * on /queue, /dashboard and /analytics the element the step names appears a few
 * hundred milliseconds after the route does. We poll for it, and if it never
 * turns up we return null so the caller can centre the card rather than stall.
 *
 * The page does not scroll. The shell is h-screen overflow-hidden and the real
 * scroller is main > div.overflow-auto, so window scroll listeners see nothing.
 * scrollIntoView walks whatever ancestor actually scrolls, which is why it is
 * used here and in the queue's pagination for the same reason.
 *
 * The rect moves for reasons no single event reports: that inner scroller,
 * late data reflowing the page, fonts landing, the sidebar drawer opening. One
 * requestAnimationFrame loop reading one element covers all of them and costs
 * less than the three observers it replaces. State is only written when the
 * numbers actually change, so this does not re render every frame.
 */
export function useAnchorRect(anchor: string | undefined, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!active || !anchor) {
      setRect(null)
      return
    }

    let raf = 0
    let cancelled = false
    let scrolled = false
    const startedAt = performance.now()
    let last: Rect | null = null

    const sameRect = (a: Rect | null, b: Rect | null) =>
      !!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height

    const tick = () => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)

      if (!el) {
        // Give it a while, then hand back null and let the caller centre.
        if (performance.now() - startedAt > FIND_TIMEOUT_MS) {
          if (last !== null) { last = null; setRect(null) }
          return
        }
        raf = requestAnimationFrame(tick)
        return
      }

      if (!scrolled) {
        scrolled = true
        el.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        })
      }

      const r = el.getBoundingClientRect()
      const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height }
      if (!sameRect(last, next)) {
        last = next
        setRect(next)
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [anchor, active])

  return rect
}
