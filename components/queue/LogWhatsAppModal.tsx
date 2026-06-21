"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { X } from "lucide-react"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { enqueueOfflineAction } from "@/lib/offline/queue"

const WA_OUTCOMES = [
  { value: "WA_REPLIED_1H",         label: "Replied within 1 hour" },
  { value: "WA_REPLIED_SAME_DAY",   label: "Replied same day" },
  { value: "WA_REPLIED_NEXT_DAY",   label: "Replied next day" },
  { value: "WA_NO_REPLY_24H",       label: "No reply in 24h" },
  { value: "WA_NO_REPLY_48H",       label: "No reply in 48h" },
  { value: "WA_BLOCKED",            label: "Blocked" },
]

const WA_TAGS = [
  { value: "WA_TAG_NEGOTIATING",    label: "Negotiating price" },
  { value: "WA_TAG_SITE_VISIT",     label: "Requested site visit" },
  { value: "WA_TAG_COMPARING",      label: "Comparing options" },
  { value: "WA_TAG_NOT_INTERESTED", label: "Not interested" },
]

interface Props {
  open:     boolean
  onClose:  () => void
  leadId:   string
  leadName: string
}

export function LogWhatsAppModal({ open, onClose, leadId, leadName }: Props) {
  const queryClient = useQueryClient()
  const [outcome, setOutcome] = useState("")
  const [tag, setTag]         = useState("")
  const [notes, setNotes]     = useState("")
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!outcome) { toast.error("Select a conversation outcome"); return }

    const body = {
      lead_id:          leadId,
      outcome,
      conversation_tag: tag || undefined,
      notes:            notes.trim() || undefined,
    }

    setSaving(true)
    try {
      if (!navigator.onLine) {
        enqueueOfflineAction({ url: "/api/signals/whatsapp", method: "POST", body })
        toast.info("Offline — WhatsApp log saved locally and will sync when connected")
        handleClose()
        return
      }

      const res = await fetch("/api/signals/whatsapp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? "Failed to log WhatsApp")
        return
      }

      toast.success("WhatsApp interaction logged")
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
      queryClient.invalidateQueries({ queryKey: ["queue"] })
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setOutcome("")
    setTag("")
    setNotes("")
    onClose()
  }

  if (!open) return null

  const labelCls = "text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block"

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl glass-3 gloss-edge p-6 space-y-4
                      shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-bold text-slate-900 truncate pr-3">Log WhatsApp — {leadName}</p>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/70 text-slate-400 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Conversation outcome <span className="text-rose-500">*</span></label>
          <ThemedSelect
            value={outcome}
            onValueChange={setOutcome}
            options={WA_OUTCOMES}
            placeholder="What happened?"
            aria-label="Conversation outcome"
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Conversation tag (optional)</label>
          <ThemedSelect
            value={tag}
            onValueChange={setTag}
            options={WA_TAGS}
            placeholder="Tag this conversation…"
            aria-label="Conversation tag"
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Notes</label>
          <textarea
            placeholder="Summarise the conversation…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[13px] text-ink
                       placeholder:text-ink-faint resize-none focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 transition-colors"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleClose}
            disabled={saving}
            className="flex-1 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold
                       text-slate-600 hover:bg-white/70 transition-all bg-white/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold transition-all
                       bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                       disabled:opacity-50 active:scale-[0.98]"
          >
            {saving ? "Saving…" : "Log WhatsApp"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
