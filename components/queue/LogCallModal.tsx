"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { enqueueOfflineAction } from "@/lib/offline/queue"

const CALL_OUTCOMES = [
  { value: "CALL_ANSWERED_INTERESTED",     label: "Answered — Interested" },
  { value: "CALL_ANSWERED_CALLBACK",       label: "Answered — Callback Later" },
  { value: "CALL_ANSWERED_NOT_INTERESTED", label: "Answered — Not Interested" },
  { value: "CALL_ANSWERED_WRONG_NUMBER",   label: "Wrong Number" },
  { value: "CALL_NO_ANSWER",               label: "No Answer" },
  { value: "CALL_BUSY",                    label: "Busy" },
  { value: "CALL_SWITCHED_OFF",            label: "Switched Off" },
]

interface Props {
  open:      boolean
  onClose:   () => void
  leadId:    string
  leadName:  string
}

export function LogCallModal({ open, onClose, leadId, leadName }: Props) {
  const queryClient = useQueryClient()
  const [outcome, setOutcome]     = useState("")
  const [notes, setNotes]         = useState("")
  const [duration, setDuration]   = useState("")
  const [saving, setSaving]       = useState(false)

  async function handleSave() {
    if (!outcome) { toast.error("Select a call outcome"); return }

    const body = {
      lead_id:       leadId,
      outcome,
      notes:         notes.trim() || undefined,
      duration_secs: duration ? parseInt(duration) * 60 : undefined,
    }

    setSaving(true)
    try {
      if (!navigator.onLine) {
        enqueueOfflineAction({ url: "/api/signals/call", method: "POST", body })
        toast.info("Offline — call saved locally and will sync when connected")
        handleClose()
        return
      }

      const res = await fetch("/api/signals/call", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? "Failed to log call")
        return
      }

      toast.success("Call logged")
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
      queryClient.invalidateQueries({ queryKey: ["queue"] })
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setOutcome("")
    setNotes("")
    setDuration("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Call — {leadName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Outcome <span className="text-destructive">*</span></Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select outcome…" />
              </SelectTrigger>
              <SelectContent>
                {CALL_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="What was discussed?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Log Call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
