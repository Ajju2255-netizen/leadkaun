"use client"

/**
 * LeadSlideOver — right-side drawer with lead summary + actions.
 *
 * Mounted by both /leads and /queue. Mirrors the full-record page's visual
 * language (avatar, expected value, Call/WhatsApp, Fit/Intent/Quality score
 * bars, next-best-action, activity) in a focused drawer.
 *
 * Keyboard: Esc closes. Backdrop click closes. Enter + exit are animated.
 */

import { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, X, Phone, Mail, Clock, Ban } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { AvatarCircle } from "@/components/shared/AvatarCircle"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { ContactActions } from "@/components/shared/ContactActions"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/format"

// ── Local helpers ────────────────────────────────────────────────────────────

function fmtVal(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

const SIG: Record<string, string> = {
  CALL_ANSWERED_INTERESTED:     "Answered — Interested",
  CALL_ANSWERED_NOT_INTERESTED: "Answered — Not interested",
  CALL_ANSWERED_CALLBACK:       "Answered — Requested callback",
  CALL_NO_ANSWER:               "No answer",
  CALL_BUSY:                    "Line busy",
  CALL_SWITCHED_OFF:            "Phone switched off",
  WA_REPLIED_1H:                "WhatsApp replied within 1h",
  WA_REPLIED_SAME_DAY:          "WhatsApp replied same day",
  WA_REPLIED_NEXT_DAY:          "WhatsApp replied next day",
  WA_NO_REPLY_24H:              "No WhatsApp reply in 24h",
  WA_NO_REPLY_48H:              "No WhatsApp reply in 48h",
  WA_TAG_NEGOTIATING:           "Actively negotiating",
  WA_TAG_SITE_VISIT:            "Requested site visit",
  WA_TAG_COMPARING:             "Comparing options",
  WA_TAG_NOT_INTERESTED:        "Not interested",
  SOURCE_BASELINE:              "Lead imported",
  INTENT_DECAY:                 "Intent decayed (no activity)",
}

// Next-best-action styling by grade — icon + colour reflect the actual action
// (call / nurture / drop), so the block reads correctly for every lead instead
// of always showing a green "act now" tile.
const NBA_STYLE: Record<string, { Icon: typeof Phone; grad: string; bg: string; ring: string }> = {
  A: { Icon: Phone, grad: "linear-gradient(180deg,#6EE7B7,#10B981)", bg: "bg-emerald-50/70", ring: "ring-emerald-100" },
  B: { Icon: Phone, grad: "linear-gradient(180deg,#7DD3FC,#0EA5E9)", bg: "bg-sky-50/70",     ring: "ring-sky-100"     },
  C: { Icon: Mail,  grad: "linear-gradient(180deg,#FCD34D,#F59E0B)", bg: "bg-amber-50/70",   ring: "ring-amber-100"   },
  D: { Icon: Clock, grad: "linear-gradient(180deg,#CBD5E1,#94A3B8)", bg: "bg-slate-50",      ring: "ring-slate-200"   },
  E: { Icon: Ban,   grad: "linear-gradient(180deg,#FDA4AF,#F43F5E)", bg: "bg-rose-50/70",    ring: "ring-rose-100"    },
  F: { Icon: Ban,   grad: "linear-gradient(180deg,#CBD5E1,#94A3B8)", bg: "bg-slate-50",      ring: "ring-slate-200"   },
}

export interface LeadSlideOverProps {
  leadId: string
  onClose: () => void
}

export function LeadSlideOver({ leadId, onClose }: LeadSlideOverProps) {
  const [shown, setShown] = useState(false)
  // Portal target — only available on the client.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const { data: raw, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn:  () => fetch(`/api/leads/${leadId}`, { credentials: "include" }).then(r => r.json()),
    enabled:  !!leadId,
  })

  const lead     = raw ?? null
  const fullName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unnamed lead"
  const subtitle = [lead?.company_name, lead?.city].filter(Boolean).join(" · ")

  // Animated close: slide out, then unmount via parent.
  const handleClose = useCallback(() => {
    setShown(false)
    const t = setTimeout(onClose, 200)
    return () => clearTimeout(t)
  }, [onClose])

  // Enter animation on mount
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [])

  // Keyboard close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") handleClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [handleClose])

  const scores = lead
    ? [
        { type: "fit"     as const, label: "Fit",     value: lead.fit_score },
        { type: "intent"  as const, label: "Intent",  value: lead.intent_score },
        { type: "quality" as const, label: "Quality", value: lead.quality_score },
      ].filter(s => typeof s.value === "number")
    : []

  if (!mounted) return null

  return createPortal(
    <>
      {/* Centered modal — dimmed backdrop wrapper (click outside to close).
          Portaled to <body> so the overlay escapes the main panel's
          backdrop-filter containing block and dims the whole app (incl. sidebar). */}
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/55 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      >
        {/* Panel — calm fade + scale entrance, no sideways slide */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Lead — ${fullName}`}
          onClick={e => e.stopPropagation()}
          className={`w-[440px] max-w-full max-h-[88vh] bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.45)] flex flex-col overflow-hidden transition-all duration-200 ease-out ${shown ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="relative shrink-0 px-5 pt-5 pb-4 border-b border-slate-100">
          {/* soft top wash */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-50/70 to-transparent" />

          <div className="relative flex items-start gap-3 pr-[72px]">
            {lead
              ? <AvatarCircle seed={fullName} size="lg" />
              : <Skeleton className="w-11 h-11 rounded-full" />}

            <div className="min-w-0 flex-1">
              {isLoading
                ? <Skeleton className="h-5 w-36 mb-1.5" />
                : <p className="text-[16px] font-bold text-slate-900 leading-tight truncate">{fullName}</p>}
              {isLoading
                ? <Skeleton className="h-3.5 w-28 mt-1" />
                : subtitle
                  ? <p className="text-[12px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
                  : null}
            </div>
          </div>

          {/* Tag row + expected value */}
          {lead && (
            <div className="relative flex items-end justify-between gap-3 mt-3.5">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center gap-1.5">
                  <GradeBadge grade={lead.grade} size="md" />
                  {typeof lead.score === "number" && (
                    <span className="text-[11px] font-bold tabular-nums text-slate-500">{lead.score}<span className="text-slate-300">/100</span></span>
                  )}
                </span>
                {lead.stage?.name && (
                  <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-100 px-2.5 py-0.5 text-[11px] font-semibold">
                    {lead.stage.name}
                  </span>
                )}
                {lead.source?.name && (
                  <span className="inline-flex items-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-100 px-2.5 py-0.5 text-[11px] font-medium">
                    {lead.source.name}
                  </span>
                )}
              </div>

              {/* Expected value */}
              {lead.expected_value ? (
                <div className="text-right shrink-0">
                  <p className="text-[18px] font-black tabular-nums text-slate-900 leading-none">{fmtVal(lead.expected_value)}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400 mt-1">Expected</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Header controls */}
          <div className="absolute top-4 right-4 flex items-center gap-1">
            {lead && (
              <Link href={`/leads/${leadId}`} onClick={onClose} aria-label="Open full record">
                <span className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </Link>
            )}
            <button
              onClick={handleClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable content ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : lead ? (
            <>
              {/* Primary actions — shared Call / WhatsApp + one-tap outcome */}
              <div className="px-5 py-4">
                <ContactActions leadId={leadId} leadName={fullName} phone={lead.phone} variant="panel" />
              </div>

              {/* Next best action — icon + colour reflect the action/grade */}
              {lead.next_action && (() => {
                const s = NBA_STYLE[lead.grade] ?? NBA_STYLE.D
                const Icon = s.Icon
                return (
                  <div className="px-5 pb-4">
                    <div className={`flex items-start gap-3 rounded-2xl ring-1 px-4 py-3 ${s.bg} ${s.ring}`}>
                      <span
                        className="mt-0.5 w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-white"
                        style={{ background: s.grad, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" }}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-900 leading-snug">{lead.next_action.label}</p>
                        {lead.next_action.reason && (
                          <p className="text-[12px] text-slate-500 leading-relaxed mt-0.5">{lead.next_action.reason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Lead score */}
              {scores.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-3">Lead score</p>
                  <div className="space-y-3">
                    {scores.map(s => (
                      <ScoreBar key={s.type} type={s.type} label={s.label} value={s.value as number} />
                    ))}
                  </div>
                </div>
              )}

              {/* Details */}
              <div className="px-5 py-4 border-t border-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-3">Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                  {[
                    { label: "Phone",  value: lead.phone },
                    { label: "Email",  value: lead.email },
                    { label: "Stage",  value: lead.stage?.name },
                    { label: "Source", value: lead.source?.name },
                    { label: "Rep",    value: lead.assigned_rep ? `${lead.assigned_rep.first_name} ${lead.assigned_rep.last_name ?? ""}`.trim() : null },
                    { label: "Added",  value: lead.imported_at ?? lead.created_at
                        ? new Date(lead.imported_at ?? lead.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : null },
                  ].filter(d => d.value).map(({ label, value }) => (
                    <div key={label} className="min-w-0">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em]">{label}</p>
                      <p className="text-[12px] font-medium text-slate-700 leading-snug mt-0.5 break-words">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inquiry / notes */}
              {lead.inquiry_text && (
                <div className="px-5 py-4 border-t border-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-2">Inquiry</p>
                  <p className="text-[12px] text-slate-600 leading-relaxed rounded-xl bg-slate-50 px-3.5 py-2.5">{lead.inquiry_text}</p>
                </div>
              )}

              {/* Activity timeline */}
              {lead.signals && lead.signals.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-3">Activity</p>
                  <div className="relative space-y-3.5 before:absolute before:left-[3px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-100">
                    {(lead.signals as {
                      id: string; signal_type: string; signal_value: number; created_at: string
                    }[]).slice(0, 8).map(sig => {
                      const label = SIG[sig.signal_type] ?? sig.signal_type.replace(/_/g, " ").toLowerCase()
                      const isPos = sig.signal_value >= 0
                      return (
                        <div key={sig.id} className="relative flex items-start gap-3 pl-4">
                          <div className={`absolute left-0 mt-1.5 w-[7px] h-[7px] rounded-full ring-2 ring-white shrink-0 ${isPos ? "bg-emerald-400" : "bg-red-400"}`} />
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-slate-700 leading-snug">{label}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(sig.created_at)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="px-5 py-12 text-center text-[13px] text-slate-400">Lead not found.</div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        {lead && (
          <div className="px-5 py-3 border-t border-slate-100 shrink-0 bg-white">
            <Link href={`/leads/${leadId}`} onClick={onClose}>
              <span className="w-full flex items-center justify-center gap-1.5 h-10 rounded-full border border-slate-200 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                View full record <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        )}
        </div>
      </div>
    </>,
    document.body,
  )
}
