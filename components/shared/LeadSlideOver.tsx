"use client"

/**
 * LeadSlideOver — right-side drawer with lead summary + actions.
 *
 * Extracted from app/(dashboard)/leads/page.tsx so both /leads and /queue
 * can mount it without duplicating ~180 lines of JSX. Behaviour identical.
 *
 * Keyboard: Esc closes. Backdrop click closes. Backdrop is a translucent
 * blur over the whole viewport.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, X, Phone, MessageCircle } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { LogCallModal } from "@/components/queue/LogCallModal"
import { LogWhatsAppModal } from "@/components/queue/LogWhatsAppModal"
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

export interface LeadSlideOverProps {
  leadId: string
  onClose: () => void
}

export function LeadSlideOver({ leadId, onClose }: LeadSlideOverProps) {
  const [callOpen, setCallOpen] = useState(false)
  const [waOpen,   setWaOpen]   = useState(false)

  const { data: raw, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn:  () => fetch(`/api/leads/${leadId}`, { credentials: "include" }).then(r => r.json()),
    enabled:  !!leadId,
  })

  const lead     = raw ?? null
  const fullName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ")

  // Keyboard close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel — positioned to stay inside the shell's h-screen container */}
      <div className="fixed top-3 bottom-3 right-3 z-50 w-[400px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {lead ? (
              <GradeBadge grade={lead.grade} size="lg" />
            ) : (
              <Skeleton className="w-9 h-9 rounded-full" />
            )}
            <div className="min-w-0">
              {isLoading
                ? <Skeleton className="h-5 w-32 mb-1.5" />
                : <p className="text-[16px] font-bold text-slate-900 leading-tight">{fullName}</p>}
              {isLoading
                ? <Skeleton className="h-3.5 w-24" />
                : <p className="text-[12px] text-slate-400 mt-0.5">
                    {[lead?.company_name, lead?.city].filter(Boolean).join(" · ")}
                  </p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {lead && (
              <Link href={`/leads/${leadId}`} onClick={onClose}>
                <button className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </Link>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : lead ? (
            <>
              {/* Value + action + buttons */}
              <div className="px-5 py-4 border-b border-slate-50 space-y-3">
                {lead.expected_value && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Expected value</p>
                    <p className="text-[30px] font-black tabular-nums text-slate-900 leading-none mt-0.5">
                      {fmtVal(lead.expected_value)}
                    </p>
                  </div>
                )}

                {lead.next_action && (
                  <div>
                    <p className="text-[13px] font-semibold text-slate-900 leading-snug">{lead.next_action.label}</p>
                    <p className="text-[12px] text-slate-400 leading-relaxed mt-0.5">{lead.next_action.reason}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-0.5">
                  <button
                    onClick={() => setCallOpen(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold active:scale-[0.97] transition-all shadow-[0_1px_2px_rgba(14, 165, 233,0.25)]"
                  >
                    <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
                    Call Now
                  </button>
                  <button
                    onClick={() => setWaOpen(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[12px] font-medium active:scale-[0.97] transition-all"
                  >
                    <MessageCircle className="w-3.5 h-3.5" strokeWidth={2} />
                    Message
                  </button>
                </div>
              </div>

              {/* Details grid */}
              <div className="px-5 py-4 border-b border-slate-50 space-y-2.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-3">Details</p>
                {[
                  { label: "Phone",  value: lead.phone },
                  { label: "Email",  value: lead.email },
                  { label: "Stage",  value: lead.stage?.name },
                  { label: "Source", value: lead.source?.name },
                  { label: "Rep",    value: lead.assigned_rep ? `${lead.assigned_rep.first_name} ${lead.assigned_rep.last_name ?? ""}`.trim() : null },
                  { label: "Added",  value: lead.imported_at ?? lead.created_at
                      ? new Date(lead.imported_at ?? lead.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                      : null },
                ].filter(d => d.value).map(({ label, value }) => (
                  <div key={label} className="flex gap-3">
                    <span className="text-[11px] font-semibold text-slate-400 w-12 shrink-0 mt-px">{label}</span>
                    <span className="text-[12px] font-medium text-slate-700 leading-snug">{value}</span>
                  </div>
                ))}
              </div>

              {/* Activity timeline */}
              {lead.signals && lead.signals.length > 0 && (
                <div className="px-5 py-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">Activity</p>
                  <div className="space-y-3">
                    {(lead.signals as {
                      id: string; signal_type: string; signal_value: number; created_at: string
                    }[]).slice(0, 7).map(sig => {
                      const label = SIG[sig.signal_type] ?? sig.signal_type.replace(/_/g, " ").toLowerCase()
                      const isPos = sig.signal_value >= 0
                      return (
                        <div key={sig.id} className="flex items-start gap-2.5">
                          <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${isPos ? "bg-emerald-400" : "bg-red-400"}`} />
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-slate-700 leading-snug">{label}</p>
                            <p className="text-[11px] text-slate-400">{timeAgo(sig.created_at)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="px-5 py-8 text-center text-[13px] text-slate-400">Lead not found.</div>
          )}
        </div>

        {/* Footer */}
        {lead && (
          <div className="px-5 py-3 border-t border-slate-100 shrink-0">
            <Link href={`/leads/${leadId}`} onClick={onClose}>
              <button className="w-full flex items-center justify-center gap-1.5 h-9 rounded-full border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                View full record <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
        )}
      </div>

      {lead && (
        <>
          <LogCallModal     open={callOpen} onClose={() => setCallOpen(false)} leadId={leadId} leadName={fullName} />
          <LogWhatsAppModal open={waOpen}   onClose={() => setWaOpen(false)}   leadId={leadId} leadName={fullName} />
        </>
      )}
    </>
  )
}
