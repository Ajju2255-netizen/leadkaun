"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronRight, ArrowRight, Loader2 } from "lucide-react"
import type { IntakeReport as IntakeReportData } from "@/lib/intake/types"
import { patchIntakeSession } from "@/lib/intake/client"

const RATING_STYLE: Record<string, { text: string; seg: string; fill: number }> = {
  Excellent:      { text: "text-emerald-700", seg: "bg-emerald-500", fill: 3 },
  Good:           { text: "text-sky-700",     seg: "bg-sky-500",     fill: 2 },
  "Needs review": { text: "text-amber-700",   seg: "bg-amber-500",   fill: 1 },
}

const CANCEL_REASONS = [
  { key: "TOO_MANY_DUPLICATES", label: "Too many duplicates" },
  { key: "NEED_TO_CLEAN_CSV",   label: "Need to clean my file" },
  { key: "WRONG_MAPPING",       label: "Columns look wrong" },
  { key: "OTHER",               label: "Other" },
]

/**
 * The Import Intelligence Report — Leadkaun's first conversation with a customer.
 * Renders the frozen report the Intake Engine produced; nothing is imported until
 * the customer approves. Reveal understanding before acting (Law 46).
 */
export function IntakeReport({
  report,
  sessionId,
  importing = false,
  onApprove,
  onCancel,
}: {
  report: IntakeReportData
  sessionId: string | null
  importing?: boolean
  onApprove: () => void
  onCancel: (reason?: string) => void
}) {
  const [cancelling, setCancelling] = useState(false)
  const viewedLogged = useRef(false)

  // Report Viewed — once (TTT).
  useEffect(() => {
    if (viewedLogged.current || !sessionId) return
    viewedLogged.current = true
    patchIntakeSession(sessionId, "viewed")
  }, [sessionId])

  const conclusions: string[] = []
  conclusions.push(report.businessType.known ? report.businessType.claim : report.leadType.claim)
  if (report.country.known) conclusions.push(report.country.claim)
  if (report.contactQuality.primary !== "none") {
    conclusions.push(`${report.contactQuality.primary === "phone" ? "Phone numbers are" : "Emails are"} your primary contact method`)
  }
  if (report.currency.known) conclusions.push(report.currency.claim)

  return (
    <div className="glass-2 gloss-edge rounded-2xl px-6 py-8 sm:px-10 sm:py-10 max-w-3xl mx-auto">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Import Intelligence Report</p>
      <h1 className="mt-3 font-serif text-[30px] leading-[1.1] font-semibold text-ink tracking-[-0.01em]">We analysed your leads.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft max-w-[52ch]">
        Before importing your leads, we took a moment to understand them. This helps Leadkaun prioritise
        the right opportunities from the very beginning.
      </p>

      <div className="my-8 h-px bg-hairline" />

      {/* Here's what we understood */}
      <section>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-4">Here&apos;s what we understood</p>
        <ul className="space-y-2.5">
          {conclusions.map((c, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] text-ink">
              <Check className="w-4 h-4 mt-1 shrink-0 text-emerald-600" strokeWidth={2.6} />
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 rounded-xl bg-emerald-50/70 border border-emerald-100 px-4 py-3.5 text-[14px] leading-relaxed text-ink">
          <span className="font-semibold">Nothing has been imported yet.</span> We&apos;re simply showing you what we
          believe before asking for your approval.
        </p>
      </section>

      {/* Data readiness */}
      <section className="mt-9">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-3">Data readiness</p>
        <p className="text-[15px] font-medium text-ink mb-2">
          {report.readiness.label === "High" ? "Ready to import today." : report.readiness.message}
        </p>
        <ul>
          {report.dataReadiness.map((d) => {
            const st = RATING_STYLE[d.rating] ?? RATING_STYLE.Good
            return (
              <li key={d.area} className="flex items-baseline gap-3 py-3 border-t border-hairline">
                <span className="flex-1 text-[14px] text-ink">{d.area}</span>
                <span className="text-[12px] text-ink-muted">{d.note}</span>
                <span className={`inline-flex items-center gap-2 text-[13px] font-semibold justify-end min-w-[120px] ${st.text}`}>
                  {d.rating}
                  <span className="inline-flex gap-[3px]">
                    {[0, 1, 2].map((n) => (
                      <span key={n} className={`w-4 h-1 rounded-full ${n < st.fill ? st.seg : "bg-slate-200"}`} />
                    ))}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        {report.missingFields.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
            <span className="font-semibold text-ink">Missing information</span>
            {report.missingFields.map((m) => (
              <span key={m} className="rounded-md bg-amber-50 text-amber-700 px-2 py-0.5 text-[12px] font-semibold">{m}</span>
            ))}
          </p>
        )}
      </section>

      {/* A few things stood out */}
      {report.noticed.length > 0 && (
        <section className="mt-9">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-3">A few things stood out</p>
          <ul className="space-y-2">
            {report.noticed.map((n, i) => (
              <li key={i} className="relative pl-5 text-[14px] text-ink-soft leading-relaxed">
                <span className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full bg-ink-faint" />
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What happens after import */}
      <section className="mt-9">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-3">What happens after import</p>
        <ul className="space-y-2">
          {report.whatHappensNext.map((w, i) => (
            <li key={i} className="flex items-center gap-3 text-[14px] text-ink">
              <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              {w}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-ink-muted leading-relaxed">
          These actions happen automatically after import. You don&apos;t need to configure anything first.
        </p>
      </section>

      {/* Recommendation + CTA */}
      <section className="mt-9 rounded-2xl bg-emerald-50/60 border border-emerald-100 p-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-700 mb-2">Recommendation</p>
        <p className="text-[14px] text-ink-soft max-w-[46ch]">{report.recommendation}</p>
        <p className="mt-4 text-[16px] font-semibold text-ink">Your data is ready.</p>
        <p className="text-[14px] text-ink-soft">Leadkaun has enough information to begin prioritising your leads.</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onApprove}
            disabled={importing}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-[14px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "linear-gradient(180deg, #34D399 0%, #10B981 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 16px rgba(16,185,129,0.30)",
            }}
          >
            {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : <>Start Prioritising Leads <ArrowRight className="w-4 h-4" /></>}
          </button>
          {!importing && (
            <button type="button" onClick={() => setCancelling((c) => !c)} className="text-[13px] font-medium text-ink-muted hover:text-ink-soft transition-colors">
              Not now
            </button>
          )}
        </div>

        <p className="mt-4 text-[12px] text-ink-muted leading-relaxed max-w-[48ch]">
          You can review and improve your data later. Leadkaun will continue learning as your team works.
        </p>

        {cancelling && !importing && (
          <div className="mt-4 border-t border-emerald-100 pt-4">
            <p className="text-[13px] text-ink-soft mb-2">Mind sharing why? (optional)</p>
            <div className="flex flex-wrap gap-2">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onCancel(r.key)}
                  className="text-[12px] text-ink-soft border border-hairline-strong bg-white/70 hover:border-sky-300 hover:text-sky-700 rounded-full px-3 py-1 transition-colors"
                >
                  {r.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onCancel()}
                className="text-[12px] text-ink-faint hover:text-ink-soft rounded-full px-3 py-1 transition-colors"
              >
                Just close
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Closing */}
      <p className="mt-8 font-serif text-[17px] leading-[1.5] text-ink">{report.closingLine}</p>

      {/* How did we determine this? */}
      <details className="mt-6 border-t border-hairline pt-4 group">
        <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft">
          <ChevronRight className="w-3.5 h-3.5 text-ink-faint transition-transform group-open:rotate-90" />
          How did we determine this?
        </summary>
        <ul className="mt-3 space-y-1.5">
          {report.howWeDetermined.map((h, i) => (
            <li key={i} className="pl-4 relative text-[13px] text-ink-muted leading-relaxed">
              <span className="absolute left-0 text-ink-faint">—</span> {h}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
