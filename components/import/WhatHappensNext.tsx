"use client"

import { ScanLine, Gauge, ListOrdered } from "lucide-react"

/**
 * What the import will do, said before the upload.
 *
 * IntakeReport already explains this, but only once a file has been parsed,
 * which is after the moment people were stalling. Someone deciding whether to
 * go and find their CSV needs to know what they get for the trouble, and that
 * nothing is imported until they approve it.
 *
 * The numbered tile shape deliberately matches the one in onboarding's
 * "Bring your leads" step, so arriving here reads as the same flow continuing
 * rather than a different screen with different rules.
 */
const STEPS = [
  {
    n: "01",
    Icon: ScanLine,
    title: "Read",
    body: "We read your columns and show you what we found. Nothing is imported until you approve it.",
  },
  {
    n: "02",
    Icon: Gauge,
    title: "Grade",
    body: "Every lead gets a fit and intent read, then a grade from A to F.",
  },
  {
    n: "03",
    Icon: ListOrdered,
    title: "Queue",
    body: "Your priority queue fills up, sorted by who is worth calling first.",
  },
]

export function WhatHappensNext() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {STEPS.map(({ n, Icon, title, body }) => (
        <div key={n} className="rounded-xl border border-slate-200/70 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-50 text-sky-600 shrink-0">
              <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
            <span className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-ink-faint">{n}</span>
            <span className="text-[13px] font-semibold text-ink">{title}</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">{body}</p>
        </div>
      ))}
    </div>
  )
}
