"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * ThemedSelect — the single dropdown language for the app.
 *
 * Built on the base-ui Select (components/ui/select.tsx), which renders its
 * option list in a themed portal popup — unlike a native <select>, whose open
 * list always falls back to OS styling and never matches the glass theme.
 * Use this everywhere a single-choice dropdown is needed.
 *
 * Variants:
 *   "input" (default) — full-width input-style control for forms/modals.
 *   "pill"            — compact rounded-full glass chip for filter toolbars.
 */

export interface ThemedSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export function ThemedSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  size = "default",
  variant = "input",
  leadingIcon,
  "aria-label": ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  options: ThemedSelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Trigger class override. */
  className?: string
  size?: "sm" | "default"
  variant?: "input" | "pill"
  /** Optional icon rendered at the left of the trigger (e.g. a filter glyph). */
  leadingIcon?: React.ReactNode
  "aria-label"?: string
}) {
  // Pass `items` so the trigger renders the selected option's LABEL even before
  // the popup has ever opened (base-ui otherwise shows the raw value until the
  // list mounts once).
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]))

  const pillCls =
    "!h-9 rounded-full bg-white/70 backdrop-blur-sm border-white/70 text-[12px] font-semibold text-slate-700"

  return (
    <Select items={items} value={value} onValueChange={(v) => onValueChange(v ?? "")} disabled={disabled}>
      <SelectTrigger
        size={size}
        className={cn(variant === "pill" && pillCls, className)}
        aria-label={ariaLabel}
      >
        {leadingIcon}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
