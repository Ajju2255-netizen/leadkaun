"use client"

/**
 * QueueFilters — small popover panel triggered by the "Filters" toolbar
 * button. Currently exposes:
 *   - Channel toggles  (Has WhatsApp activity / Has phone call)
 *   - Action toggle    (Hide leads contacted today)
 *
 * Filter state is owned by the parent so it can be reflected in URL
 * search params. This component is purely presentational.
 *
 * Click-outside / Esc close handled internally.
 */

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface QueueFiltersState {
  channels:        Set<"whatsapp" | "phone">
  hideContactedToday: boolean
}

export const emptyFilters: QueueFiltersState = {
  channels:        new Set(),
  hideContactedToday: false,
}

export function filtersAreActive(f: QueueFiltersState): boolean {
  return f.channels.size > 0 || f.hideContactedToday
}

export interface QueueFiltersProps {
  open:    boolean
  onClose: () => void
  state:   QueueFiltersState
  onChange: (next: QueueFiltersState) => void
}

export function QueueFilters({ open, onClose, state, onChange }: QueueFiltersProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClick)
    }
  }, [open, onClose])

  if (!open) return null

  function toggleChannel(c: "whatsapp" | "phone") {
    const next = new Set(state.channels)
    if (next.has(c)) next.delete(c); else next.add(c)
    onChange({ ...state, channels: next })
  }

  function reset() {
    onChange(emptyFilters)
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 mt-2 w-[280px] rounded-2xl bg-white shadow-2xl border border-slate-200/70 z-30 p-4 space-y-3.5"
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-ink">Filters</p>
        <button onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Channel activity</p>
        <div className="flex gap-1.5 flex-wrap">
          {(["whatsapp", "phone"] as const).map((c) => {
            const active = state.channels.has(c)
            return (
              <button
                key={c}
                onClick={() => toggleChannel(c)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold transition-all border",
                  active
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                )}
              >
                {c === "whatsapp" ? "Has WhatsApp" : "Has phone call"}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Activity</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={state.hideContactedToday}
            onChange={(e) => onChange({ ...state, hideContactedToday: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30"
          />
          <span className="text-[12px] text-slate-700">Hide leads contacted today</span>
        </label>
      </div>

      <div className="pt-1 flex items-center justify-between border-t border-slate-100">
        <button
          onClick={reset}
          disabled={!filtersAreActive(state)}
          className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 disabled:text-slate-300 disabled:cursor-not-allowed pt-2"
        >
          Reset filters
        </button>
        <button
          onClick={onClose}
          className="mt-1 inline-flex items-center justify-center h-8 px-3.5 rounded-full bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700"
        >
          Done
        </button>
      </div>
    </div>
  )
}
