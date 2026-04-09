"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log WhatsApp — {leadName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Conversation outcome <span className="text-destructive">*</span></Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="What happened?" />
              </SelectTrigger>
              <SelectContent>
                {WA_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Conversation tag (optional)</Label>
            <Select value={tag} onValueChange={(v) => setTag(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Tag this conversation…" />
              </SelectTrigger>
              <SelectContent>
                {WA_TAGS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Summarise the conversation…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Log WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
