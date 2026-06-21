"use client"

/**
 * ContactActions — the one shared Call + WhatsApp control used everywhere.
 *
 * Tap **Call** → opens the phone dialer (tel:) and reveals a one-tap outcome
 * bar that logs to /api/signals/call. Tap **WhatsApp** → opens the wa.me chat
 * and reveals a one-tap outcome bar that logs to /api/signals/whatsapp. No
 * modal forms; offline-safe; refreshes the lead + queue caches on success.
 *
 * Drop it anywhere a lead can be contacted — hero card, detail modal, lead
 * page, follow-ups, missed-opps — via the `variant` size prop.
 */

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { enqueueOfflineAction } from "@/lib/offline/queue"
import { Phone, MessageCircle, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Tone = "good" | "warm" | "cold" | "neutral"

const CALL_OUTCOMES: { value: string; label: string; tone: Tone }[] = [
  { value: "CALL_ANSWERED_INTERESTED",     label: "Interested",     tone: "good"    },
  { value: "CALL_ANSWERED_CALLBACK",       label: "Callback",       tone: "warm"    },
  { value: "CALL_NO_ANSWER",               label: "No answer",      tone: "neutral" },
  { value: "CALL_BUSY",                    label: "Busy",           tone: "neutral" },
  { value: "CALL_ANSWERED_NOT_INTERESTED", label: "Not interested", tone: "cold"    },
]

const WA_OUTCOMES: { value: string; label: string; tone: Tone }[] = [
  { value: "WA_REPLIED_1H",       label: "Replied <1h", tone: "good"    },
  { value: "WA_REPLIED_SAME_DAY", label: "Replied today", tone: "warm"  },
  { value: "WA_NO_REPLY_24H",     label: "No reply 24h", tone: "neutral" },
  { value: "WA_NO_REPLY_48H",     label: "No reply 48h", tone: "neutral" },
  { value: "WA_BLOCKED",          label: "Blocked",      tone: "cold"    },
]

const TONE: Record<Tone, string> = {
  good:    "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100",
  warm:    "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100",
  cold:    "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100",
  neutral: "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100",
}

type Variant = "hero" | "panel" | "compact"

const SIZE: Record<Variant, { h: string; text: string; gap: string; grow: boolean }> = {
  hero:    { h: "h-11", text: "text-[13px]", gap: "gap-2.5", grow: true  },
  panel:   { h: "h-10", text: "text-[13px]",   gap: "gap-2",   grow: true  },
  compact: { h: "h-9",  text: "text-[12px]", gap: "gap-2",   grow: false },
}

export interface ContactActionsProps {
  leadId:   string
  leadName: string
  phone?:   string | null
  variant?: Variant
  className?: string
  /** Rendered after the Call/WhatsApp buttons in idle mode (e.g. a "View" link). */
  trailing?: React.ReactNode
  /** Called after a successful log (e.g. to advance a follow-up step). */
  onLogged?: (channel: "call" | "wa", outcome: string) => void
}

export function ContactActions({
  leadId, leadName, phone, variant = "panel", className, trailing, onLogged,
}: ContactActionsProps) {
  const queryClient = useQueryClient()
  const [mode, setMode]     = useState<"idle" | "call" | "wa">("idle")
  const [saving, setSaving] = useState<string | null>(null)
  const sz = SIZE[variant]
  const firstName = leadName.split(" ")[0] || "lead"

  function startCall() {
    if (phone) window.location.href = `tel:${phone}`
    setMode("call")
  }

  function startWhatsApp() {
    if (phone) {
      const num = phone.replace(/[^0-9]/g, "")
      if (num) window.open(`https://wa.me/${num}`, "_blank", "noopener")
    }
    setMode("wa")
  }

  async function logOutcome(channel: "call" | "wa", outcome: string) {
    const url  = channel === "call" ? "/api/signals/call" : "/api/signals/whatsapp"
    const body = { lead_id: leadId, outcome }
    setSaving(outcome)
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueOfflineAction({ url, method: "POST", body })
        toast.info("Offline — saved locally, will sync when connected")
        setMode("idle"); onLogged?.(channel, outcome)
        return
      }
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "Failed to log")
        return
      }
      toast.success(channel === "call" ? "Call logged" : "WhatsApp logged")
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
      queryClient.invalidateQueries({ queryKey: ["queue"] })
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      setMode("idle")
      onLogged?.(channel, outcome)
    } finally {
      setSaving(null)
    }
  }

  // ── Outcome bar (after dialing / messaging) ────────────────────────────────
  if (mode !== "idle") {
    const channel  = mode
    const outcomes = channel === "call" ? CALL_OUTCOMES : WA_OUTCOMES
    const verb     = channel === "call" ? "Calling" : "Messaging"
    const Icon     = channel === "call" ? Phone : MessageCircle
    return (
      <div className={cn("rounded-2xl bg-white/80 ring-1 ring-sky-100 px-4 py-3", className)}>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted inline-flex items-center gap-1.5">
            <Icon className="w-3 h-3 text-sky-600" /> {verb} {firstName} — how did it go?
          </p>
          <button
            onClick={() => setMode("idle")}
            className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {outcomes.map((o) => (
            <button
              key={o.value}
              onClick={() => logOutcome(channel, o.value)}
              disabled={saving !== null}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-semibold ring-1 transition-all active:scale-[0.97] disabled:opacity-50",
                TONE[o.tone],
              )}
            >
              {saving === o.value && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Idle: Call + WhatsApp buttons ──────────────────────────────────────────
  return (
    <div className={cn("flex flex-wrap items-center", sz.gap, className)}>
      <button
        onClick={startCall}
        className={cn(
          "flex items-center justify-center gap-2 rounded-full text-white font-bold active:scale-[0.98] transition-all px-5",
          sz.h, sz.text, sz.grow && "flex-1 min-w-[140px]",
        )}
        style={{ background: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 20px rgba(14,165,233,0.32)" }}
      >
        <Phone className="w-4 h-4" strokeWidth={2.5} /> Call Now
      </button>
      <button
        onClick={startWhatsApp}
        className={cn(
          "flex items-center justify-center gap-2 rounded-full bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 active:scale-[0.98] transition-all px-5",
          sz.h, sz.text, sz.grow && "flex-1 min-w-[140px]",
        )}
      >
        <MessageCircle className="w-4 h-4" strokeWidth={2} /> WhatsApp
      </button>
      {trailing}
    </div>
  )
}
