"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import Link from "next/link"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// ── Types ─────────────────────────────────────────────────────────────────────

interface NextAction {
  label:    string
  priority: number
  reason:   string
  color:    string
}

interface PipelineLead {
  id:               string
  first_name:       string
  last_name:        string | null
  grade:            string
  expected_value:   number | null
  company_name:     string | null
  stage_id:         string
  stage_entered_at: string
  stage_reason:     string | null
  next_action:      NextAction | null
}

interface Stage {
  id:    string
  name:  string
  key:   string
  order: number
}

interface PipelineData {
  stages: Stage[]
  leads:  PipelineLead[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stuckWarning(stageKey: string, enteredAt: string): string | null {
  const hours = (Date.now() - new Date(enteredAt).getTime()) / 3_600_000
  if (stageKey === "contacted"     && hours > 48) return `Stuck ${Math.floor(hours / 24)}d`
  if (stageKey === "proposal_sent" && hours > 72) return `No close in ${Math.floor(hours / 24)}d`
  return null
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

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

// ── Lead Card ─────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  stageKey,
  onWon,
  onLost,
}: {
  lead:     PipelineLead
  stageKey: string
  onWon:    () => void
  onLost:   () => void
}) {
  const stuck = stuckWarning(stageKey, lead.stage_entered_at)

  return (
    <div className="rounded-xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-3 space-y-2.5">

      {/* Header row */}
      <div className="flex items-start gap-2">
        <GradeBadge grade={lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/leads/${lead.id}`}
            className="text-[13px] font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate block leading-tight"
          >
            {lead.first_name} {lead.last_name}
          </Link>
          {lead.company_name && (
            <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">{lead.company_name}</p>
          )}
        </div>
        {lead.expected_value ? (
          <RupeeValue amount={lead.expected_value} className="text-[12px] font-bold text-emerald-700 tabular-nums shrink-0" />
        ) : null}
      </div>

      {/* Next action pill */}
      {lead.next_action && (
        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${lead.next_action.color}`}>
          {lead.next_action.label}
        </span>
      )}

      {/* Stuck warning */}
      {stuck && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1">
          <p className="text-[11px] font-semibold text-amber-800">⚠️ {stuck}</p>
        </div>
      )}

      {/* Stage reason */}
      {lead.stage_reason && (
        <p className="text-[11px] text-slate-400 italic leading-tight">{lead.stage_reason}</p>
      )}

      {/* Actions */}
      <div className="flex gap-1.5 pt-0.5">
        <button
          onClick={onWon}
          className="flex-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-50 transition-colors"
        >
          Won
        </button>
        <button
          onClick={onLost}
          className="flex-1 text-[11px] font-semibold text-red-600 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 transition-colors"
        >
          Lost
        </button>
      </div>

    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

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

  // Build a key→stage map for stuckWarning
  const stageKeyMap = stages.reduce<Record<string, string>>((acc, s) => {
    acc[s.id] = s.key
    return acc
  }, {})

  const byStage = stages.reduce<Record<string, PipelineLead[]>>((acc, stage) => {
    acc[stage.id] = leads.filter((l) => l.stage_id === stage.id)
    return acc
  }, {})

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Pipeline</h1>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-64 w-56 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Pipeline</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">Stage moves automatically when you log calls and WhatsApp signals</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {stages.map((stage) => {
          const stageLeads = byStage[stage.id] ?? []
          const totalValue = stageLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0)

          return (
            <div key={stage.id} className="w-[200px] shrink-0 space-y-2">

              {/* Column header */}
              <div className="rounded-t-xl border border-b-0 bg-slate-50 px-3 py-2.5">
                <p className="text-[12px] font-semibold text-slate-700">{stage.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-slate-400">{stageLeads.length} lead{stageLeads.length !== 1 ? "s" : ""}</span>
                  {totalValue > 0 && (
                    <RupeeValue amount={totalValue} className="text-[11px] text-emerald-600 font-semibold" />
                  )}
                </div>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[4rem]">
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stageKey={stageKeyMap[lead.stage_id] ?? ""}
                    onWon={() => setWonLeadId(lead.id)}
                    onLost={() => setLostLeadId(lead.id)}
                  />
                ))}
                {stageLeads.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 h-16 flex items-center justify-center">
                    <p className="text-[11px] text-slate-300">Empty</p>
                  </div>
                )}
              </div>

            </div>
          )
        })}

        {stages.length === 0 && (
          <p className="text-slate-400 text-sm py-8">No pipeline stages configured.</p>
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

// ── Won Modal ─────────────────────────────────────────────────────────────────

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
      <div className="bg-white rounded-xl border p-6 w-full max-w-sm space-y-4 shadow-xl">
        <h2 className="text-[16px] font-bold text-slate-900">Mark as Won</h2>
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-slate-700">Deal Value (₹) <span className="text-red-500">*</span></label>
          <input type="number" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Required"
            value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-slate-700">Win Reason <span className="text-red-500">*</span></label>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select…</option>
            {["COMPETITIVE_PRICE","BEST_FIT","REFERRAL_TRUST","FAST_DELIVERY","EXISTING_RELATIONSHIP","OTHER"].map(r =>
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

// ── Lost Modal ────────────────────────────────────────────────────────────────

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
      <div className="bg-white rounded-xl border p-6 w-full max-w-sm space-y-4 shadow-xl">
        <h2 className="text-[16px] font-bold text-slate-900">Mark as Lost</h2>
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-slate-700">Loss Reason <span className="text-red-500">*</span></label>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select…</option>
            {["PRICE_TOO_HIGH","WENT_COMPETITOR","NO_BUDGET","NO_RESPONSE","REQUIREMENT_CHANGED","WRONG_FIT","OTHER"].map(r =>
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
