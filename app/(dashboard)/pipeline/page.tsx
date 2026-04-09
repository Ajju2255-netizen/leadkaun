"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import Link from "next/link"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

interface PipelineLead {
  id:             string
  first_name:     string
  last_name:      string | null
  grade:          string
  expected_value: number | null
  company_name:   string | null
  stage_id:       string
}

interface Stage {
  id:    string
  name:  string
  order: number
}

interface PipelineData {
  stages: Stage[]
  leads:  PipelineLead[]
}

async function fetchPipeline(): Promise<PipelineData> {
  const [stagesRes, leadsRes] = await Promise.all([
    fetch("/api/pipeline/stages", { credentials: "include" }),
    fetch("/api/leads?page=1", { credentials: "include" }),
  ])
  const stages = stagesRes.ok ? await stagesRes.json() : { stages: [] }
  const leads  = leadsRes.ok  ? await leadsRes.json()  : { leads: [] }
  return {
    stages: (stages.stages ?? []).sort((a: Stage, b: Stage) => a.order - b.order),
    leads:  leads.leads ?? [],
  }
}

export default function PipelinePage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery<PipelineData>({
    queryKey:  ["pipeline"],
    queryFn:   fetchPipeline,
    staleTime: 30_000,
  })

  const [wonLeadId, setWonLeadId]   = useState<string | null>(null)
  const [lostLeadId, setLostLeadId] = useState<string | null>(null)

  const stages = data?.stages ?? []
  const leads  = data?.leads  ?? []

  const byStage = stages.reduce<Record<string, PipelineLead[]>>((acc, stage) => {
    acc[stage.id] = leads.filter((l) => l.stage_id === stage.id)
    return acc
  }, {})

  async function moveStage(leadId: string, targetStageId: string) {
    const res = await fetch(`/api/leads/${leadId}/stage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ stage_id: targetStageId }),
      credentials: "include",
    })
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] })
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Failed to move stage")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-64 w-56 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pipeline</h1>

      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {stages.map((stage) => {
          const stageLeads = byStage[stage.id] ?? []
          const totalValue = stageLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0)

          return (
            <div key={stage.id} className="w-56 shrink-0 space-y-2">
              <div className="rounded-t-lg border bg-muted/50 px-3 py-2">
                <p className="text-sm font-medium">{stage.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{stageLeads.length}</span>
                  {totalValue > 0 && <RupeeValue amount={totalValue} className="text-xs" />}
                </div>
              </div>

              <div className="space-y-2 min-h-[4rem]">
                {stageLeads.map((lead) => (
                  <div key={lead.id} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={lead.grade} size="sm" />
                      <Link href={`/leads/${lead.id}`} className="text-sm font-medium truncate hover:underline">
                        {lead.first_name} {lead.last_name}
                      </Link>
                    </div>
                    {lead.company_name && (
                      <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>
                    )}
                    {lead.expected_value && (
                      <RupeeValue amount={lead.expected_value} className="text-xs text-muted-foreground" />
                    )}

                    <div className="flex gap-1 flex-wrap">
                      {stages
                        .filter((s) => s.id !== stage.id)
                        .slice(0, 2)
                        .map((s) => (
                          <button
                            key={s.id}
                            onClick={() => moveStage(lead.id, s.id)}
                            className="text-xs text-muted-foreground hover:text-foreground border rounded px-1.5 py-0.5"
                          >
                            → {s.name.substring(0, 8)}
                          </button>
                        ))}
                      <button
                        onClick={() => setWonLeadId(lead.id)}
                        className="text-xs text-green-600 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-50"
                      >
                        Won
                      </button>
                      <button
                        onClick={() => setLostLeadId(lead.id)}
                        className="text-xs text-red-500 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50"
                      >
                        Lost
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {stages.length === 0 && (
          <p className="text-muted-foreground text-sm py-8">No pipeline stages configured.</p>
        )}
      </div>

      {wonLeadId && (
        <WonModal
          leadId={wonLeadId}
          onClose={() => setWonLeadId(null)}
          onSuccess={() => { setWonLeadId(null); queryClient.invalidateQueries({ queryKey: ["pipeline"] }) }}
        />
      )}
      {lostLeadId && (
        <LostModal
          leadId={lostLeadId}
          onClose={() => setLostLeadId(null)}
          onSuccess={() => { setLostLeadId(null); queryClient.invalidateQueries({ queryKey: ["pipeline"] }) }}
        />
      )}
    </div>
  )
}

function WonModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess: () => void }) {
  const [value, setValue]   = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!value || parseInt(value) <= 0) { toast.error("Deal value is required"); return }
    if (!reason) { toast.error("Win reason is required"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/won`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ won_value: parseInt(value), win_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Marked as Won!"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold">Mark as Won</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Deal Value (₹) <span className="text-destructive">*</span></label>
          <input type="number" className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Required"
            value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Win Reason <span className="text-destructive">*</span></label>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select…</option>
            {["PRICE_MATCH","PRODUCT_FIT","RELATIONSHIP","COMPETITOR_LOST","URGENCY","OTHER"].map(r =>
              <option key={r} value={r}>{r.replace(/_/g," ")}</option>)}
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

function LostModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!reason) { toast.error("Loss reason is required"); return }
    setSaving(true)
    const res = await fetch(`/api/leads/${leadId}/lost`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ loss_reason: reason }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Marked as Lost"); onSuccess() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold">Mark as Lost</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Loss Reason <span className="text-destructive">*</span></label>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select…</option>
            {["PRICE_TOO_HIGH","WENT_TO_COMPETITOR","NO_BUDGET","NO_REQUIREMENT","NO_RESPONSE","TIMING","OTHER"].map(r =>
              <option key={r} value={r}>{r.replace(/_/g," ")}</option>)}
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
