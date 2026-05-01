"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Phone, MessageCircle, ArrowUpRight, MapPin, Zap, Clock, Moon } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { LogCallModal } from "./LogCallModal"
import { LogWhatsAppModal } from "./LogWhatsAppModal"
import type { QueueLead } from "@/hooks/useQueue"

// ── Constants ─────────────────────────────────────────────────────────────────

const HOT_SIGNAL_LABEL: Record<string, string> = {
  CALL_ANSWERED_INTERESTED:  "Said they're interested",
  CALL_ANSWERED_CALLBACK:    "Asked for a callback",
  WA_REPLIED_1H:             "Replied to WhatsApp",
  WA_REPLIED_4H:             "Replied to WhatsApp",
  WA_REPLIED_24H:            "Replied to WhatsApp",
  WA_TAG_ASKED_PRICING:      "Asked for pricing",
  WA_TAG_NEGOTIATING:        "Actively negotiating",
  WA_TAG_DECISION_PENDING:   "Decision pending",
}

const SIGNAL_LABEL_SHORT: Record<string, string> = {
  CALL_ANSWERED_INTERESTED:     "Answered (interested)",
  CALL_ANSWERED_NOT_INTERESTED: "Answered (not interested)",
  CALL_ANSWERED_CALLBACK:       "Callback requested",
  CALL_ANSWERED_WRONG_NUMBER:   "Wrong number",
  CALL_NOT_ANSWERED:            "Call (no answer)",
  CALL_BUSY:                    "Call (busy)",
  CALL_VOICEMAIL:               "Voicemail",
  CALL_INVALID:                 "Invalid number",
  WA_REPLIED_1H:                "WA replied",
  WA_REPLIED_4H:                "WA replied",
  WA_REPLIED_24H:               "WA replied",
  WA_NO_REPLY:                  "WA (no reply)",
  WA_TAG_ASKED_PRICING:         "Asked for pricing",
  WA_TAG_NEGOTIATING:           "WA negotiating",
  WA_TAG_DECISION_PENDING:      "Decision pending",
  WA_TAG_NOT_SERIOUS:           "Not serious",
  WA_TAG_WRONG_NUMBER:          "Wrong number (WA)",
  WA_TAG_GENERAL_CHAT:          "WA chat",
  WA_TAG_BROCHURE:              "Requested brochure",
  WA_TAG_COMPARING:             "Comparing options",
}

// Grade A: 6h cold threshold, Grade B: 24h
export const COLD_THRESHOLD_H: Record<string, number> = { A: 6, B: 24 }

// Coastal Sunrise grade accent gradients (top of card)
const GRADE_TOP_ACCENT: Record<string, string> = {
  A: "linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)",   // mint
  B: "linear-gradient(90deg, #38BDF8 0%, #0EA5E9 100%)",   // sky
  C: "linear-gradient(90deg, #FDBA74 0%, #FB923C 100%)",   // peach
  D: "linear-gradient(90deg, #FB923C 0%, #F97316 100%)",   // orange
  E: "linear-gradient(90deg, #F87171 0%, #DC2626 100%)",   // red
  F: "linear-gradient(90deg, #CBD5E1 0%, #94A3B8 100%)",   // slate
}

const IMPORT_AGE_TEXT: { test: (h: number) => boolean; text: string }[] = [
  { test: (h) => h < 2,  text: "New"                       },
  { test: (h) => h < 8,  text: "Active"                    },
  { test: (h) => h < 24, text: "Response window closing"   },
  { test: () => true,    text: "At risk"                    },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function importAgeText(hours: number | null): string | null {
  if (hours === null) return null
  return IMPORT_AGE_TEXT.find((e) => e.test(hours))?.text ?? null
}

export function coldCountdown(lead: QueueLead): { label: string; color: string } | null {
  const threshold = COLD_THRESHOLD_H[lead.grade]
  if (!threshold) return null

  let hoursElapsed: number
  if (lead.last_action_at) {
    hoursElapsed = (Date.now() - new Date(lead.last_action_at).getTime()) / 3_600_000
  } else {
    hoursElapsed = lead.hours_since_import ?? 0
  }

  const hoursLeft = threshold - hoursElapsed
  if (hoursLeft >= threshold * 0.5) return null

  if (hoursLeft <= 0) return { label: "Response window expired", color: "text-red-600" }
  if (hoursLeft < 1) {
    const minsLeft = Math.round(hoursLeft * 60)
    return { label: `${minsLeft}m remaining`, color: "text-red-600" }
  }
  const h = Math.floor(hoursLeft)
  const m = Math.round((hoursLeft - h) * 60)
  return {
    label: m > 0 ? `${h}h ${m}m remaining` : `${h}h remaining`,
    color: hoursLeft < 2 ? "text-red-500" : "text-orange-500",
  }
}

function lastActionText(lead: QueueLead): string | null {
  if (!lead.last_signal_type || lead.minutes_since_last_signal == null) return null
  const shortLabel = SIGNAL_LABEL_SHORT[lead.last_signal_type] ?? null
  if (!shortLabel) return null
  const t = lead.minutes_since_last_signal
  const ago = t < 60 ? `${t}m ago` : `${Math.floor(t / 60)}h ago`
  return `Last: ${shortLabel} · ${ago}`
}

// ── Urgency bar (Grade A/B only) ─────────────────────────────────────────────

function UrgencyBar({ lead }: { lead: QueueLead }) {
  const threshold = lead.grade === "A" ? 6 : 24
  const hoursElapsed = lead.last_action_at
    ? (Date.now() - new Date(lead.last_action_at).getTime()) / 3_600_000
    : (lead.hours_since_import ?? 0)
  const pct = Math.max(0, Math.min(100, ((threshold - hoursElapsed) / threshold) * 100))

  // Coastal Sunrise urgency colors
  const fill =
    pct < 20
      ? "linear-gradient(90deg, #F87171 0%, #DC2626 100%)"   // red urgent
      : pct < 50
      ? "linear-gradient(90deg, #FDBA74 0%, #FB923C 100%)"   // peach warning
      : "linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)"   // mint healthy

  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-xl overflow-hidden"
      style={{ background: "rgba(15,23,42,0.06)" }}
    >
      <div
        className={`h-full rounded-b-xl transition-all duration-500 ${pct < 20 ? "urgent-blink" : ""}`}
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const SNOOZE_OPTIONS = [
  { value: "1_day",    label: "1 day"   },
  { value: "3_days",   label: "3 days"  },
  { value: "1_week",   label: "1 week"  },
  { value: "2_weeks",  label: "2 weeks" },
  { value: "1_month",  label: "1 month" },
] as const

export function QueueCard({
  lead,
  isSelected,
  onSelect,
}: {
  lead:       QueueLead
  isSelected?: boolean
  onSelect?:   (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [callOpen,    setCallOpen]    = useState(false)
  const [waOpen,      setWaOpen]      = useState(false)
  const [snoozeOpen,  setSnoozeOpen]  = useState(false)
  const [snoozing,    setSnoozing]    = useState(false)
  const [, setTick] = useState(0)

  async function handleSnooze(duration: typeof SNOOZE_OPTIONS[number]["value"]) {
    if (snoozing) return
    setSnoozing(true)
    setSnoozeOpen(false)
    const res = await fetch(`/api/leads/${lead.id}/snooze`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ duration }),
    })
    setSnoozing(false)
    if (res.ok) {
      const label = SNOOZE_OPTIONS.find((o) => o.value === duration)?.label ?? duration
      toast.success(`Snoozed for ${label}`)
      queryClient.invalidateQueries({ queryKey: ["queue"] })
    } else {
      toast.error("Failed to snooze")
    }
  }

  // Live tick every 30s for Grade A/B so countdown + urgency bar update in real-time
  useEffect(() => {
    if (lead.grade !== "A" && lead.grade !== "B") return
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [lead.grade])

  const fullName    = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  const isHot       = lead.grade === "A" || lead.grade === "B"
  const gradeUp     = lead.previous_grade && lead.previous_grade > lead.grade
  const countdown   = !lead.is_hot_signal && isHot ? coldCountdown(lead) : null
  const lastAction  = !lead.is_hot_signal ? lastActionText(lead) : null
  const ageText     = !lead.is_hot_signal && !lastAction && isHot ? importAgeText(lead.hours_since_import) : null

  return (
    <>
      <div
        onClick={() => onSelect?.(lead.id)}
        className={`
          relative rounded-xl transition-all duration-220 ease-out overflow-hidden
          ${onSelect ? "cursor-pointer" : ""}
          ${isSelected ? "ring-2 ring-sky-500/30" : ""}
          ${lead.is_hot_signal ? "card-hot" : "glass-card-lift"}
        `}
      >

        {/* ── Grade accent bar (top) — Coastal Sunrise gradient ─────────── */}
        <div
          className="h-[2px] w-full"
          style={{ background: GRADE_TOP_ACCENT[lead.grade] ?? GRADE_TOP_ACCENT["F"] }}
        />

        {/* ── Top row: identity + value ───────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
          <div className="flex items-start gap-3 min-w-0">
            <GradeBadge grade={lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="md" />
            <div className="min-w-0">
              <Link
                href={`/leads/${lead.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[15px] font-semibold text-ink hover:text-sky-600 transition-colors leading-snug truncate block"
              >
                {fullName}
              </Link>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {lead.company_name && (
                  <span className="text-[12px] text-ink-soft truncate">{lead.company_name}</span>
                )}
                {lead.company_name && lead.city && (
                  <span className="text-ink-faint text-[12px]">·</span>
                )}
                {lead.city && (
                  <span className="inline-flex items-center gap-0.5 text-[12px] text-ink-soft">
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    {lead.city}
                  </span>
                )}
              </div>
            </div>
          </div>

          {lead.expected_value ? (
            <div className="shrink-0 text-right">
              <p className="text-[20px] font-black tabular-nums leading-none text-ink">
                {formatValue(lead.expected_value)}
              </p>
              <p className="text-[10px] text-ink-muted font-medium mt-0.5 uppercase tracking-wide">
                expected
              </p>
            </div>
          ) : null}
        </div>

        {/* ── Signal / meta row ───────────────────────────────────────── */}
        <div className="px-4 pt-2 space-y-1">

          {/* Hot signal inline */}
          {lead.is_hot_signal && lead.last_signal_type && lead.minutes_since_last_signal != null && (
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-sky-600 shrink-0" strokeWidth={2.5} />
              <span className="text-[12px] font-semibold text-sky-700 leading-snug">
                {HOT_SIGNAL_LABEL[lead.last_signal_type] ?? "Active signal"}
              </span>
              <span className="text-[11px] text-sky-500 tabular-nums">
                · {formatMins(lead.minutes_since_last_signal)}
              </span>
            </div>
          )}

          {/* Grade upgrade pill — mint */}
          {gradeUp && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full text-emerald-700 bg-emerald-50"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 4px rgba(16,185,129,0.20)" }}
            >
              ↑ Upgraded from {lead.previous_grade}
            </span>
          )}

          {/* Last action context */}
          {lastAction && (
            <p className="text-[11px] text-ink-soft">{lastAction}</p>
          )}

          {/* Generic age fallback */}
          {ageText && (
            <p className="text-[11px] text-ink-soft">{ageText}</p>
          )}

          {/* Time-to-cold countdown */}
          {countdown && (
            <div className="flex items-center gap-1">
              <Clock
                className={`w-3 h-3 shrink-0 ${countdown.color.includes("red") ? "text-red-500" : "text-orange-500"}`}
                strokeWidth={2.5}
              />
              <p className={`text-[11px] font-semibold ${countdown.color}`}>{countdown.label}</p>
            </div>
          )}
        </div>

        {/* ── Action intelligence ─────────────────────────────────────── */}
        <div className="px-4 pt-2 space-y-0">
          <p className="text-[12px] font-medium text-ink-soft leading-snug">
            {lead.next_action.label}
          </p>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            {lead.next_action.reason}
          </p>
        </div>

        {/* ── Separator — hairline ────────────────────────────────────── */}
        <div className="mx-4 mt-1" style={{ borderTop: "1px solid var(--hairline)" }} />

        {/* ── Action buttons ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-4">

          {/* Call — sky glossy primary */}
          <button
            onClick={(e) => { e.stopPropagation(); setCallOpen(true) }}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5 h-9"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
            Call
          </button>

          {/* Message — frosted glass secondary */}
          <button
            onClick={(e) => { e.stopPropagation(); setWaOpen(true) }}
            className="btn-secondary flex-1 flex items-center justify-center gap-1.5 h-9"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={2} />
            Message
          </button>

          {/* Snooze */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setSnoozeOpen((o) => !o) }}
              title="Snooze lead"
              disabled={snoozing}
              className="flex items-center justify-center h-9 w-9 rounded-full
                         text-ink-muted hover:text-sky-600 hover:bg-sky-50
                         disabled:opacity-40 transition-all duration-150"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            {snoozeOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setSnoozeOpen(false) }} />
                <div className="absolute right-0 bottom-10 z-20 min-w-[140px] glass-3 gloss-edge rounded-xl py-1.5 overflow-hidden">
                  <p className="px-3 pb-1 text-[10px] font-bold text-ink-muted uppercase tracking-wider">Snooze for</p>
                  {SNOOZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={(e) => { e.stopPropagation(); handleSnooze(opt.value) }}
                      className="w-full flex items-center px-3 py-1.5 text-[13px] text-ink
                                 hover:bg-sky-50 hover:text-sky-700 transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Link
            href={`/leads/${lead.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center h-9 w-9 rounded-full
                       text-ink-muted hover:text-sky-600 hover:bg-sky-50
                       transition-all duration-150"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>

        </div>

        {/* Urgency bar */}
        {isHot && <UrgencyBar lead={lead} />}

      </div>

      <LogCallModal     open={callOpen} onClose={() => setCallOpen(false)} leadId={lead.id} leadName={fullName} />
      <LogWhatsAppModal open={waOpen}   onClose={() => setWaOpen(false)}   leadId={lead.id} leadName={fullName} />
    </>
  )
}
