"use client"

/**
 * AvatarCircle — gradient avatar with a single initial OR a real photo.
 *
 * Pass `imageUrl` to render a portrait (cover-fit, ring outline). On image
 * load error, falls back to the gradient + initial. Palette is deterministic
 * by seed so the same person always lands on the same colour.
 */

import { useState } from "react"
import { cn } from "@/lib/utils"

const AVATAR_PALETTES = [
  { bg: "linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)" }, // mint
  { bg: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)" }, // sky
  { bg: "linear-gradient(180deg, #C4B5FD 0%, #8B5CF6 100%)" }, // violet
  { bg: "linear-gradient(180deg, #FDBA74 0%, #FB923C 100%)" }, // peach
  { bg: "linear-gradient(180deg, #F0ABFC 0%, #D946EF 100%)" }, // fuchsia
  { bg: "linear-gradient(180deg, #67E8F9 0%, #06B6D4 100%)" }, // cyan
  { bg: "linear-gradient(180deg, #F472B6 0%, #EC4899 100%)" }, // pink
  { bg: "linear-gradient(180deg, #FDE047 0%, #EAB308 100%)" }, // amber
] as const

function paletteFor(seed: string): { bg: string } {
  if (!seed) return AVATAR_PALETTES[0]
  const code = seed.charCodeAt(0) || 0
  return AVATAR_PALETTES[code % AVATAR_PALETTES.length]
}

type Size = "sm" | "md" | "lg"

const SIZE_CLS: Record<Size, string> = {
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-[13px]",
  lg: "w-11 h-11 text-[16px]",
}

export interface AvatarCircleProps {
  /** Used to compute initial + colour palette. */
  seed: string
  size?: Size
  className?: string
  /** Optional photo URL — pravatar/dicebear/etc. Falls back to initial on error. */
  imageUrl?: string
}

export function AvatarCircle({ seed, size = "md", className, imageUrl }: AvatarCircleProps) {
  const [imgError, setImgError] = useState(false)
  const initial = (seed?.[0] ?? "?").toUpperCase()
  const palette = paletteFor(initial)
  const showPhoto = !!imageUrl && !imgError

  if (showPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        onError={() => setImgError(true)}
        className={cn(
          "rounded-full shrink-0 object-cover ring-2 ring-white/80 bg-slate-100",
          SIZE_CLS[size],
          className,
        )}
        style={{ boxShadow: "0 2px 6px rgba(15,23,42,0.10)" }}
        aria-hidden="true"
      />
    )
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0 font-bold text-white select-none",
        SIZE_CLS[size],
        className,
      )}
      style={{
        background: palette.bg,
        boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 6px rgba(15,23,42,0.10)",
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  )
}
