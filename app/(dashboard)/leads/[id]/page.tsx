"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { ScoreBar } from "@/components/shared/ScoreBar"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { LeadRealtimeListener } from "@/components/leads/LeadRealtimeListener"
import { LogCallModal } from "@/components/queue/LogCallModal"
import { LogWhatsAppModal } from "@/components/queue/LogWhatsAppModal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { timeAgo, formatDuration } from "@/lib/format"

async function fetchLead(id: string) {
  const res = await fetch(`/api/leads/${id}`, { credentials: "include" })
  if (!res.ok) throw new Error("Lead not found")
  return res.json()
}

const SIGNAL_LABELS: Record<string, { label: string; positive: boolean }> = {
  CALL_ANSWERED_INTERESTED:     { label: "Answered — Interested",       positive: true  },
  CALL_ANSWERED_NOT_INTERESTED: { label: "Answered — Not Interested",   positive: false },
  CALL_ANSWERED_CALLBACK:       { label: "Answered — Callback",         positive: true  },
  CALL_ANSWERED_WRONG_NUMBER:   { label: "Wrong Number",                positive: false },
  CALL_NO_ANSWER:               { label: "No Answer",                   positive: false },
  CALL_BUSY:                    { label: "Busy",                        positive: false },
  CALL_SWITCHED_OFF:            { label: "Switched Off",                positive: false },
  WA_REPLIED_1H:                { label: "WA — Replied < 1h",           positive: true  },
  WA_REPLIED_SAME_DAY:          { label: "WA — Replied same day",       positive: true  },
  WA_REPLIED_NEXT_DAY:          { label: "WA — Replied next day",       positive: true  },
  WA_NO_REPLY_24H:              { label: "WA — No reply 24h",           positive: false },
  WA_NO_REPLY_48H:              { label: "WA — No reply 48h",           positive: false },
  WA_BLOCKED:                   { label: "WA — Blocked",                positive: false },
  WA_TAG_NEGOTIATING:           { label: "WA — Negotiating",            positive: true  },
  WA_TAG_SITE_VISIT:            { label: "WA — Requested site visit",   positive: true  },
  WA_TAG_COMPARING:             { label: "WA — Comparing",              positive: true  },
  WA_TAG_NOT_INTERESTED:        { label: "WA — Not interested",         positive: false },
  SOURCE_BASELINE:              { label: "Source baseline",             positive: true  },
  INTENT_DECAY:                 { label: "Intent decay",                positive: false },
}

export default function LeadRecordPage() {
  const params      = useParams()
  const leadId      = params.id as string
  const queryClient = useQueryClient()

  const [callOpen, setCallOpen] = useState(false)
  const [waOpen, setWaOpen]     = useState(false)
  const [markingWon, setMarkingWon]   = useState(false)
  const [markingLost, setMarkingLost] = useState(false)

  const { data: lead, isLoading, error } = useQuery({
    queryKey: ["lead", leadId],
    queryFn:  () => fetchLead(leadId),
  })

  async function handleMarkJunk() {
    const res = await fetch(`/api/leads/${leadId}/junk`, { method: "POST", credentials: "include" })
    if (res.ok) {
      toast.success("Lead marked as junk")
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
    } else {
      toast.error("Failed to mark as junk")
    }
  }

  if (isLoading) return (
    <div className="space-y-4 max-w-3xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )

  if (error || !lead) return (
    <div className="text-destructive">Lead not found.</div>
  )

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")

  return (
    <>
      <LeadRealtimeListener leadId={leadId} />

      <div className="max-w-3xl space-y-6">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GradeBadge grade={lead.grade} size="lg" />
            <div>
              <h1 className="text-2xl font-semibold">{fullName}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                {lead.company_name && <span>{lead.company_name}</span>}
                {lead.city && <span>{lead.city}</span>}
                {lead.is_junk && <Badge variant="destructive">Junk</Badge>}
                {lead.is_sql && <Badge className="bg-green-600">SQL</Badge>}
              </div>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground shrink-0">
            <RupeeValue amount={lead.expected_value} className="text-base font-semibold text-foreground" />
            {lead.stage && <p className="text-xs">{lead.stage.name}</p>}
          </div>
        </div>

        {/* ── Score bars ────────────────────────────────────────────── */}
        <div className="rounded-lg border bg-card p-4 grid grid-cols-3 gap-4">
          <ScoreBar value={lead.fit_score}     label="Fit Score"     type="fit"     showValue />
          <ScoreBar value={lead.intent_score}  label="Intent Score"  type="intent"  showValue />
          <ScoreBar value={lead.quality_score} label="Quality Score" type="quality" showValue />
        </div>

        {/* ── Meta ──────────────────────────────────────────────────── */}
        <div className="rounded-lg border bg-card p-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Phone</p>
            <p className="font-medium">{lead.phone}</p>
          </div>
          {lead.email && (
            <div>
              <p className="text-muted-foreground text-xs">Email</p>
              <p className="font-medium truncate">{lead.email}</p>
            </div>
          )}
          {lead.source && (
            <div>
              <p className="text-muted-foreground text-xs">Source</p>
              <p className="font-medium">{lead.source.name}</p>
            </div>
          )}
          {lead.speed_to_lead_hours != null && (
            <div>
              <p className="text-muted-foreground text-xs">Speed to Lead</p>
              <p className="font-medium">{formatDuration(lead.speed_to_lead_hours)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Added</p>
            <p className="font-medium">{timeAgo(lead.imported_at ?? lead.created_at)}</p>
          </div>
          {lead.first_contact_at && (
            <div>
              <p className="text-muted-foreground text-xs">First Contact</p>
              <p className="font-medium">{timeAgo(lead.first_contact_at)}</p>
            </div>
          )}
        </div>

        {/* ── NBA Banner ────────────────────────────────────────────── */}
        {lead.nba && (
          <div className="rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold">Next Best Action</p>
            <p className="text-sm">{lead.nba.action}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{lead.nba.reason}</p>
          </div>
        )}

        {/* ── Inquiry text ──────────────────────────────────────────── */}
        {lead.inquiry_text && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Inquiry</p>
            <p className="text-sm">{lead.inquiry_text}</p>
          </div>
        )}

        {/* ── Quick Actions ─────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCallOpen(true)}>Log Call</Button>
          <Button variant="outline" onClick={() => setWaOpen(true)}>Log WhatsApp</Button>
          <Button variant="outline" onClick={() => setMarkingWon(true)}>Mark Won</Button>
          <Button variant="outline" onClick={() => setMarkingLost(true)}>Mark Lost</Button>
          <Button variant="ghost" onClick={handleMarkJunk}>Mark Junk</Button>
        </div>

        {/* ── Activity Timeline ─────────────────────────────────────── */}
        {lead.signals && lead.signals.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Activity Timeline</h2>
            <div className="space-y-2">
              {lead.signals.map((signal: {
                id: string
                signal_type: string
                signal_value: number
                intent_score_before: number
                intent_score_after: number
                created_at: string
              }) => {
                const meta = SIGNAL_LABELS[signal.signal_type] ?? { label: signal.signal_type, positive: signal.signal_value > 0 }
                const delta = signal.intent_score_after - signal.intent_score_before
                return (
                  <div key={signal.id} className="flex items-start gap-3 text-sm">
                    <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${meta.positive ? "bg-green-500" : "bg-red-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-snug">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(signal.created_at)}</p>
                    </div>
                    {delta !== 0 && (
                      <span className={`text-xs font-medium shrink-0 tabular-nums ${delta > 0 ? "text-green-600" : "text-red-500"}`}>
                        {delta > 0 ? "+" : ""}{delta}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Separator />

        {/* ── Notes ─────────────────────────────────────────────────── */}
        {lead.notes && lead.notes.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Notes</h2>
            {lead.notes.map((note: { id: string; content: string; created_at: string }) => (
              <div key={note.id} className="rounded-md border bg-card px-4 py-3 text-sm">
                <p>{note.content}</p>
                <p className="text-xs text-muted-foreground mt-1">{timeAgo(note.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <LogCallModal    open={callOpen} onClose={() => setCallOpen(false)} leadId={leadId} leadName={fullName} />
      <LogWhatsAppModal open={waOpen}  onClose={() => setWaOpen(false)}   leadId={leadId} leadName={fullName} />

      {/* Won / Lost inline — simplified (full modal in Phase 9) */}
      {markingWon && (
        <WonModal leadId={leadId} onClose={() => setMarkingWon(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["lead", leadId] }); setMarkingWon(false) }}
        />
      )}
      {markingLost && (
        <LostModal leadId={leadId} onClose={() => setMarkingLost(false)}
          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["lead", leadId] }); setMarkingLost(false) }}
        />
      )}
    </>
  )
}

// ── Inline Won Modal ──────────────────────────────────────────────────────
function WonModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess: () => void }) {
  const [value, setValue]   = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!value || !reason) { toast.error("Deal value and win reason are required"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/won`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ won_value: parseInt(value), win_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Lead marked as Won!"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold">Mark as Won</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Deal Value (₹) <span className="text-destructive">*</span></label>
          <input type="number" className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g. 50000" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Win Reason <span className="text-destructive">*</span></label>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select reason…</option>
            <option value="PRICE_MATCH">Price Match</option>
            <option value="PRODUCT_FIT">Product Fit</option>
            <option value="RELATIONSHIP">Relationship</option>
            <option value="COMPETITOR_LOST">Competitor Lost</option>
            <option value="URGENCY">Urgency</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="flex-1">{saving ? "Saving…" : "Mark Won"}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Inline Lost Modal ─────────────────────────────────────────────────────
function LostModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!reason) { toast.error("Loss reason is required"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/lost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loss_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Lead marked as Lost"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold">Mark as Lost</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Loss Reason <span className="text-destructive">*</span></label>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select reason…</option>
            <option value="PRICE_TOO_HIGH">Price Too High</option>
            <option value="WENT_TO_COMPETITOR">Went to Competitor</option>
            <option value="NO_BUDGET">No Budget</option>
            <option value="NO_REQUIREMENT">No Requirement</option>
            <option value="NO_RESPONSE">No Response</option>
            <option value="TIMING">Wrong Timing</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={saving} className="flex-1">{saving ? "Saving…" : "Mark Lost"}</Button>
        </div>
      </div>
    </div>
  )
}
