"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { ExternalLink, MapPin, Phone } from "lucide-react"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { LogCallModal } from "@/components/queue/LogCallModal"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MissedLead {
  id:                 string
  first_name:         string
  last_name:          string | null
  company_name:       string | null
  city:               string | null
  grade:              string
  expected_value:     number | null
  missed_at:          string | null
  hours_since_missed: number | null
  assigned_rep:       { id: string; first_name: string; last_name: string } | null
}

interface RepMissed {
  rep_id:       string
  first_name:   string
  last_name:    string
  missed_count: number
  missed_value: number
}

interface MissedData {
  total_count:         number
  total_value:         number
  recovered_this_week: number
  leads:               MissedLead[]
  by_rep:              RepMissed[]
}

async function fetchMissed(): Promise<MissedData> {
  const res = await fetch("/api/analytics/missed", { credentials: "include" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  return res.json().then((r) => r.data)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

function missedLabel(hours: number | null): string {
  if (hours === null) return "Missed"
  if (hours < 1)  return "Just now"
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Missed Lead Card ──────────────────────────────────────────────────────────

function MissedCard({ lead }: { lead: MissedLead }) {
  const [callOpen, setCallOpen] = useState(false)
  const queryClient = useQueryClient()
  const fullName    = [lead.first_name, lead.last_name].filter(Boolean).join(" ")

  function onCallClose() {
    setCallOpen(false)
    // Refresh missed list and queue after action
    queryClient.invalidateQueries({ queryKey: ["missed-opportunities"] })
    queryClient.invalidateQueries({ queryKey: ["missed-count"] })
    queryClient.invalidateQueries({ queryKey: ["queue"] })
  }

  return (
    <>
      <div className="rounded-xl bg-white border border-red-100 border-l-[3px] border-l-red-500 shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <GradeBadge grade={lead.grade as "A" | "B" | "C" | "D" | "E" | "F"} size="md" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/leads/${lead.id}`}
                className="text-[13px] font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate block"
              >
                {fullName}
              </Link>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {lead.company_name && (
                  <p className="text-[12px] text-slate-400 truncate">{lead.company_name}</p>
                )}
                {lead.city && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400">
                    <MapPin className="w-2.5 h-2.5" />
                    {lead.city}
                  </span>
                )}
              </div>
            </div>
          </div>
          {lead.expected_value ? (
            <span className="text-[15px] font-bold text-red-700 tabular-nums shrink-0">
              {formatValue(lead.expected_value)}
            </span>
          ) : null}
        </div>

        {/* Missed reason */}
        <div className="rounded-lg px-3 py-2.5 bg-red-50 border border-red-200">
          <p className="text-[12px] font-semibold text-red-800">
            ❌ Missed {missedLabel(lead.hours_since_missed)} — no action taken in {lead.grade === "A" ? "6h" : "24h"}
          </p>
          <p className="text-[11px] text-red-700 opacity-80 mt-0.5">
            Lead went cold · {lead.assigned_rep
              ? `Assigned to ${lead.assigned_rep.first_name} ${lead.assigned_rep.last_name}`
              : "Unassigned"}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCallOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold py-2 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
            📞 Call Anyway
          </button>
          <Link
            href={`/leads/${lead.id}`}
            className="flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-400 hover:text-slate-600 transition-colors p-2"
            title="View full lead"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

      </div>

      <LogCallModal
        open={callOpen}
        onClose={onCallClose}
        leadId={lead.id}
        leadName={fullName}
      />
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MissedPage() {
  const { data, isLoading, error } = useQuery<MissedData>({
    queryKey:        ["missed-opportunities"],
    queryFn:         fetchMissed,
    refetchInterval: 60_000,
  })

  const leads    = data?.leads ?? []
  const byRep    = data?.by_rep ?? []
  const total    = data?.total_count ?? 0
  const value    = data?.total_value ?? 0
  const recovered = data?.recovered_this_week ?? 0

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Missed Opportunities</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          {isLoading ? "Loading…" : `High-value leads that went cold without action`}
        </p>
      </div>

      {/* ── Loss banner ───────────────────────────────────────────────────── */}
      {!isLoading && total > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="text-[18px] mt-0.5">❌</span>
            <div>
              <p className="text-[14px] font-bold text-red-900">
                {total} lead{total > 1 ? "s" : ""} went cold
                {value > 0 ? ` · ${formatValue(value)} potential lost` : ""}
              </p>
              <p className="text-[12px] text-red-700 opacity-80">
                Grade A not contacted in 6h · Grade B not contacted in 24h · Call anyway to recover
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Metrics row ───────────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">At Risk</p>
            <p className="text-[20px] font-bold text-red-700 tabular-nums mt-1">
              {value > 0 ? formatValue(value) : "—"}
            </p>
            <p className="text-[11px] text-slate-400">{total} leads</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Recovered (7d)</p>
            <p className="text-[20px] font-bold text-emerald-600 tabular-nums mt-1">
              {recovered > 0 ? formatValue(recovered) : "—"}
            </p>
            <p className="text-[11px] text-slate-400">Won from A/B</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Leads Overdue</p>
            <p className="text-[20px] font-bold text-slate-900 tabular-nums mt-1">{total}</p>
            <p className="text-[11px] text-slate-400">A &amp; B combined</p>
          </div>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-[160px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">
          Error: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!isLoading && total === 0 && !error && (
        <div className="rounded-xl bg-white border border-slate-100 shadow-sm px-6 py-12 text-center">
          <div className="text-[32px] mb-3">✅</div>
          <p className="text-[14px] font-semibold text-slate-700">No missed leads</p>
          <p className="text-[12px] text-slate-400 mt-1">Keep the queue moving.</p>
        </div>
      )}

      {/* ── Missed lead cards ─────────────────────────────────────────────── */}
      {!isLoading && leads.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-semibold text-slate-700">Overdue Leads</h2>
          {leads.map((lead) => (
            <MissedCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      {/* ── By rep breakdown ──────────────────────────────────────────────── */}
      {!isLoading && byRep.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold text-slate-700 mb-3">By Rep</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...byRep]
              .sort((a, b) => b.missed_value - a.missed_value)
              .map((rep) => (
                <div key={rep.rep_id} className="rounded-xl bg-white border border-slate-100 shadow-sm p-4 space-y-1">
                  <p className="text-[13px] font-semibold text-slate-800">
                    {rep.first_name} {rep.last_name}
                  </p>
                  <p className="text-[18px] font-bold text-red-700 tabular-nums">
                    {formatValue(rep.missed_value)}
                  </p>
                  <p className="text-[11px] text-slate-400">{rep.missed_count} overdue leads</p>
                </div>
              ))}
          </div>
        </div>
      )}

    </div>
  )
}
