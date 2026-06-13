"use client"

/**
 * QueueGradeTabs — sticky filter pills above the grade lead list.
 *
 * Always-visible row of "All · Grade A · Grade B · …" pills with the count
 * inside each pill. Sticky to the top of the viewport when the user scrolls
 * past it, so switching grade is one click from anywhere on the page.
 *
 * Grades with zero leads are hidden so the bar stays tight.
 */

import { cn } from "@/lib/utils"

export type GradeTab = "all" | "A" | "B" | "C" | "D" | "E"

const TABS: { key: GradeTab; label: string; dot?: string; activeBg: string }[] = [
  { key: "all", label: "All leads",                          activeBg: "bg-sky-600"     },
  { key: "A",   label: "Grade A", dot: "bg-emerald-500", activeBg: "bg-emerald-500" },
  { key: "B",   label: "Grade B", dot: "bg-sky-500",     activeBg: "bg-sky-600"     },
  { key: "C",   label: "Grade C", dot: "bg-orange-400",  activeBg: "bg-orange-500"  },
  { key: "D",   label: "Grade D", dot: "bg-amber-500",   activeBg: "bg-amber-500"   },
  { key: "E",   label: "Grade E", dot: "bg-rose-500",    activeBg: "bg-rose-500"    },
]

export interface QueueGradeTabsProps {
  active: GradeTab
  onChange: (tab: GradeTab) => void
  counts: Partial<Record<GradeTab, number>>
}

export function QueueGradeTabs({ active, onChange, counts }: QueueGradeTabsProps) {
  return (
    <div className="-mx-1 px-1 py-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((t) => {
          const count = counts[t.key] ?? 0
          if (t.key !== "all" && count === 0) return null
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-semibold transition-all",
                isActive
                  ? cn(t.activeBg, "text-white shadow-[0_1px_2px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.45)]")
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300",
              )}
            >
              {t.dot && !isActive && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", t.dot)} />}
              {t.label}
              <span
                className={cn(
                  "tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
