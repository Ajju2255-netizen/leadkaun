"use client"

/**
 * BackToTopButton — floating action button bottom-right that fades in once
 * the page is scrolled more than `threshold` pixels. Smooth-scrolls to top.
 *
 * Watches the nearest scrollable ancestor first; falls back to window scroll.
 */

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BackToTopButtonProps {
  threshold?: number
}

export function BackToTopButton({ threshold = 400 }: BackToTopButtonProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Look for the queue's own inner scroller first; fall back to any
    // [data-scroll-container] hint, then <main>, then window scroll.
    function findScrollContainer(): HTMLElement | Window {
      let el: HTMLElement | null = document.body.querySelector("[data-queue-scroll]")
      if (el) return el
      el = document.body.querySelector("[data-scroll-container]")
      if (el) return el
      el = document.body.querySelector("main") as HTMLElement | null
      if (el) {
        const style = getComputedStyle(el)
        if (style.overflowY === "auto" || style.overflowY === "scroll") return el
      }
      return window
    }

    const scroller = findScrollContainer()

    function getScrollTop(): number {
      return scroller === window
        ? window.scrollY
        : (scroller as HTMLElement).scrollTop
    }

    function onScroll() {
      setShow(getScrollTop() > threshold)
    }

    onScroll()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", onScroll)
  }, [threshold])

  function scrollTop() {
    const queueScroll = document.body.querySelector("[data-queue-scroll]") as HTMLElement | null
    if (queueScroll) {
      queueScroll.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const container = document.body.querySelector("[data-scroll-container]") as HTMLElement | null
    if (container) {
      container.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const main = document.body.querySelector("main") as HTMLElement | null
    if (main && (getComputedStyle(main).overflowY === "auto" || getComputedStyle(main).overflowY === "scroll")) {
      main.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <button
      onClick={scrollTop}
      aria-label="Back to top"
      className={cn(
        "fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full flex items-center justify-center",
        "bg-sky-600 text-white",
        "shadow-[0_4px_14px_rgba(14,165,233,0.4),inset_0_1px_0_rgba(255,255,255,0.45)]",
        "hover:translate-y-[-1px] transition-all duration-200",
        show ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
    >
      <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
    </button>
  )
}
