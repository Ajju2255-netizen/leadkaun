"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { X } from "lucide-react"

import { ModalPortal } from "@/components/shared/ModalPortal"
import type { TourStep } from "@/lib/tour/types"
import { prefersReducedMotion, type Rect } from "@/components/tour/useAnchorRect"

const GUTTER = 12
const GAP = 14
const CARD_W = 340

/**
 * The dimmed screen, the ring around the thing being described, and the card.
 *
 * Portaled to body, and that is not a style preference. The dashboard main
 * element carries glass-1, which is a backdrop filter, and a backdrop filter
 * makes an element the containing block for fixed positioned descendants. An
 * in tree overlay would be trapped inside the content area and would not dim
 * the sidebar. ModalPortal exists for exactly this and documents it.
 *
 * The cutout is one element with a very large spread box shadow rather than an
 * SVG mask or a clip path. Four rectangles around a hole means four rounding
 * bugs; clip-path with evenodd renders inconsistently in Safari when there is a
 * backdrop filter anywhere in the ancestry, and this app is full of them. A
 * spread shadow is one box, animates by transitioning its position, and is
 * never hit tested, which is why the click blocker is a separate layer.
 */
export function TourOverlay({
  step, rect, index, total, isLast, onNext, onBack, onSkip, onPrimary, primaryLabel,
}: {
  step: TourStep
  rect: Rect | null
  index: number
  total: number
  isLast: boolean
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onPrimary?: () => void
  primaryLabel?: string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(200)
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [step.id, rect, isDesktop])

  // Focus the card on every step so keyboard and screen reader users follow
  // along instead of being left wherever they were.
  useEffect(() => {
    cardRef.current?.focus()
  }, [step.id])

  const smooth = !prefersReducedMotion()
  // `mobile: "center"` means "there is nothing to point at on a phone", not
  // "never point at anything". Sidebar anchors are real elements on desktop.
  const centred = !rect || (!isDesktop && step.mobile === "center")

  // Below md the card is always a bottom sheet. Floating a 340px card around a
  // rect on a 375px screen has no good answer.
  let cardStyle: React.CSSProperties
  if (!isDesktop) {
    cardStyle = { left: 0, right: 0, bottom: 0, maxWidth: "none" }
  } else if (centred) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_W }
  } else {
    const r = rect!
    const below = window.innerHeight - (r.top + r.height) >= cardH + GAP + GUTTER
    const top = below
      ? r.top + r.height + GAP
      : Math.max(GUTTER, r.top - cardH - GAP)
    const left = Math.min(
      Math.max(GUTTER, r.left + r.width / 2 - CARD_W / 2),
      window.innerWidth - CARD_W - GUTTER,
    )
    cardStyle = { top, left, width: CARD_W }
  }

  return (
    <ModalPortal>
      {/* Blocks the app underneath. The point of the tour is to hold attention
          on one thing at a time, and the card always offers the way out. */}
      <div className="fixed inset-0 z-[200]" aria-hidden onClick={onSkip} />

      {rect && !centred ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[201] rounded-[var(--radius)]"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
            outline: "2px solid rgb(56 189 248)",
            outlineOffset: 2,
            transition: smooth ? "top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease" : undefined,
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[201]" style={{ background: "rgba(15,23,42,0.55)" }} />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className={`fixed z-[202] border border-hairline-strong bg-bg-pure elevate-3 outline-none
                    ${isDesktop ? "rounded-[var(--radius)] p-5" : "rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"}`}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="section-label">{step.chapter}</p>
          <button
            type="button"
            onClick={onSkip}
            aria-label="Close the tour"
            className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition-colors hover:text-ink-soft"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <h2 id="tour-title" className="mt-2 text-[16px] font-semibold tracking-[-0.01em] text-ink">
          {step.title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11.5px] tabular-nums text-ink-muted">
            {index + 1} of {total}
          </span>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" onClick={onBack} className="btn-ghost h-9 px-3 text-[12.5px]">
                Back
              </button>
            )}
            {isLast && onPrimary ? (
              <button type="button" onClick={onPrimary} className="btn-primary h-9 px-4 text-[12.5px]">
                {primaryLabel ?? "Finish"}
              </button>
            ) : (
              <button type="button" onClick={onNext} className="btn-primary h-9 px-4 text-[12.5px]">
                {isLast ? "Done" : "Next"}
              </button>
            )}
          </div>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:text-ink-soft"
          >
            Skip the tour
          </button>
        )}
      </div>
    </ModalPortal>
  )
}
