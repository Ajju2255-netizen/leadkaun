"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronRight, ArrowRight, Loader2, Info } from "lucide-react"
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

const BOLD_PHRASE = "understands enough to help"

/**
 * The Import Intelligence Report — Leadkaun's first conversation with a customer.
 * Renders the frozen report the Intake Engine produced; nothing is imported until
 * the customer approves. Reveal understanding before acting (Law 46).
 */
export function IntakeReport({
  report,
  sessionId,
  analysisSeconds,
  importing = false,
  onApprove,
  onCancel,
}: {
  report: IntakeReportData
  sessionId: string | null
  analysisSeconds?: number
  importing?: boolean
  onApprove: () => void
  onCancel: (reason?: string) => void
}) {
  const [cancelling, setCancelling] = useState(false)
  const [mounted, setMounted] = useState(false)
  const viewedLogged = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  // Report Viewed — once (Time to Trust).
  useEffect(() => {
    if (viewedLogged.current || !sessionId) return
    viewedLogged.current = true
    patchIntakeSession(sessionId, "viewed")
  }, [sessionId])

  // Conclusions — honest "appear to be" phrasing.
  const conclusions: string[] = []
  conclusions.push(report.businessType.known ? report.businessType.claim : report.leadType.claim)
  if (report.country.known) conclusions.push(report.country.claim)
  if (report.contactQuality.primary !== "none") {
    conclusions.push(
      report.contactQuality.primary === "phone"
        ? "Phone numbers appear to be the primary way to contact these leads."
        : "Email appears to be the primary way to contact these leads.",
    )
  }
  if (report.currency.known) conclusions.push(report.currency.claim)

  const timing =
    analysisSeconds && analysisSeconds > 0
      ? `Analysis completed in ${analysisSeconds < 0.1 ? "under 0.1" : analysisSeconds.toFixed(1)} seconds`
      : "Analysis completed in under a second"

  // Closing — split into two sentences (the pause gives the first weight), and
  // emphasise the four philosophy words in the first.
  const closingParts = report.closingLine.split(/(?<=day one\.)\s+/)
  const closingLead = closingParts[0] ?? report.closingLine
  const closingRest = closingParts.slice(1).join(" ")
  const [leadBefore, leadAfter] = closingLead.includes(BOLD_PHRASE)
    ? closingLead.split(BOLD_PHRASE)
    : [closingLead, null]

  return (
    <div
      className={`max-w-[680px] mx-auto rounded-2xl border border-hairline bg-white
        shadow-[0_1px_2px_rgba(15,40,34,0.03),0_20px_50px_-28px_rgba(15,40,34,0.22)]
        px-6 py-9 sm:px-11 sm:py-11 transition-all duration-500 ease-out motion-reduce:transition-none
        ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5"}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Import Intelligence Report</p>
      <h1 className="mt-3 font-serif text-[30px] leading-[1.08] font-semibold text-ink tracking-[-0.01em]">We analysed your leads.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft max-w-[54ch]">
        Before importing your leads, Leadkaun analysed your data to understand how your business sells and
        identify the best opportunities from day one.
      </p>

      <div className="my-8 h-px bg-hairline" />

      {/* Here's what we understood */}
      <section>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-1">Here&apos;s what we understood</p>
        <p className="text-[12px] text-ink-faint mb-4">Based on the information available in your file.</p>
        <ul className="space-y-3">
          {conclusions.map((c, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] leading-snug text-ink">
              <Check className="w-4 h-4 mt-[3px] shrink-0 text-emerald-600" strokeWidth={2.6} />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Reassurance — a distinct, quiet info box (not part of the list) */}
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3.5">
        <Info className="w-4 h-4 mt-[3px] shrink-0 text-sky-600" strokeWidth={2.2} />
        <p className="text-[13.5px] leading-relaxed text-ink">
          <span className="font-semibold">Nothing has been imported yet.</span> We&apos;re simply showing you what we
          believe before asking for your approval.
        </p>
      </div>

      {/* ── Assess ── (stronger separation than between inner sections) */}
      {/* Data readiness — adjective first, then the number */}
      <section className="mt-11 pt-10 border-t border-hairline">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-3">Data readiness</p>
        <p className="text-[15px] font-medium text-ink mb-1">
          {report.readiness.label === "High" ? "Ready to start prioritising leads." : report.readiness.message}
        </p>
        <ul>
          {report.dataReadiness.map((d) => {
            const st = RATING_STYLE[d.rating] ?? RATING_STYLE.Good
            return (
              <li key={d.area} className="flex items-center justify-between gap-4 py-3.5 border-t border-hairline">
                <span className="text-[14px] text-ink">{d.area}</span>
                <span className="text-right">
                  <span className={`inline-flex items-center gap-2 text-[13px] font-semibold ${st.text}`}>
                    {d.rating}
                    <span className="inline-flex gap-[3px]">
                      {[0, 1, 2].map((n) => (
                        <span key={n} className={`w-4 h-1 rounded-full ${n < st.fill ? st.seg : "bg-slate-200"}`} />
                      ))}
                    </span>
                  </span>
                  <span className="block text-[12px] text-ink-muted mt-0.5">{d.note}</span>
                </span>
              </li>
            )
          })}
        </ul>
        {report.missingFields.length > 0 && (
          <div className="mt-5">
            <p className="text-[13px] text-ink-soft mb-2">Adding these fields later will improve prioritisation:</p>
            <ul className="space-y-1.5">
              {report.missingFields.map((m) => (
                <li key={m} className="flex items-center gap-2.5 text-[13.5px] text-ink">
                  <span className="w-1 h-1 rounded-full bg-ink-faint" /> {m}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* A few things stood out */}
      {report.noticed.length > 0 && (
        <section className="mt-9">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-3">A few things stood out</p>
          <ul className="space-y-2.5">
            {report.noticed.map((n, i) => (
              <li key={i} className="relative pl-5 text-[14px] text-ink-soft leading-relaxed">
                <span className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full bg-ink-faint" />
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Decide ── (stronger separation than between inner sections) */}
      {/* What happens after import */}
      <section className="mt-11 pt-10 border-t border-hairline">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted mb-3">What happens after import</p>
        <ul className="space-y-2.5">
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
        <p className="text-[14px] text-ink-soft max-w-[48ch]">{report.recommendation}</p>
        <p className="mt-4 text-[16px] font-semibold text-ink">Your data is ready.</p>
        <p className="text-[14px] text-ink-soft">Leadkaun has enough information to begin prioritising your leads.</p>

        <div className="mt-5 flex flex-wrap items-center gap-4">
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
              Review Later
            </button>
          )}
        </div>

        <p className="mt-4 text-[12px] text-ink-muted leading-relaxed max-w-[50ch]">
          You can review and improve your data later. Leadkaun will continue learning as your team works.
        </p>

        {cancelling && !importing && (
          <div className="mt-4 border-t border-emerald-100 pt-4">
            <p className="text-[13px] text-ink-soft mb-2">Mind sharing why? (optional)</p>
            <div className="flex flex-wrap gap-2">
              {CANCEL_REASONS.map((rsn) => (
                <button
                  key={rsn.key}
                  type="button"
                  onClick={() => onCancel(rsn.key)}
                  className="text-[12px] text-ink-soft border border-hairline-strong bg-white/70 hover:border-sky-300 hover:text-sky-700 rounded-full px-3 py-1 transition-colors"
                >
                  {rsn.label}
                </button>
              ))}
              <button type="button" onClick={() => onCancel()} className="text-[12px] text-ink-faint hover:text-ink-soft rounded-full px-3 py-1 transition-colors">
                Just close
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Closing — two paragraphs; four philosophy words emphasised */}
      <div className="mt-8 font-serif text-[17px] leading-[1.5] text-ink space-y-3">
        <p>
          {leadBefore}
          {leadAfter !== null && <><strong className="font-semibold">{BOLD_PHRASE}</strong>{leadAfter}</>}
        </p>
        {closingRest && <p className="text-ink-soft">{closingRest}</p>}
      </div>

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

      {/* Deterministic, not opaque AI — quiet, at the bottom. */}
      <p className="mt-6 text-right text-[11px] tabular-nums text-ink-faint">{timing}</p>
    </div>
  )
}
