"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Download, FileSpreadsheet, FileType2, UserPlus, Lock,
  CloudUpload, Cog, ShieldCheck, Users, CheckCircle2,
  AlertCircle, Clock, Star, IndianRupee, ArrowRight,
  Sparkles, RotateCw,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/EmptyState"
import { useCurrentUser } from "@/hooks/useCurrentUser"

// ── Types ────────────────────────────────────────────────────────────────────

interface LeadSource    { id: string; name: string }
interface PipelineStage { id: string; name: string; order: number }

interface ErrorDetail {
  total_errors: number
  shown:        number
  truncated:    boolean
  rows:         string[]
}

interface ImportJob {
  id:                string
  status:            "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED"
  name:              string | null
  file_name:         string | null
  source_name:       string | null
  total_rows:        number | null
  inserted:          number
  duplicates:        number
  errors:            number
  progress_pct:      number
  high_intent_count: number
  total_value:       number
  error_detail:      ErrorDetail | null
  created_at:        string
  completed_at:      string | null
}

type Stage = "idle" | "uploading" | "parsing" | "scoring" | "deduplicating" | "complete"

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}Cr`
  if (n >= 1_00_000)    return `${(n / 1_00_000).toFixed(1)}L`
  if (n >= 1_000)       return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString("en-IN")
}

// Map progress % → which stage we're currently in.
function stageFromProgress(p: number | null): Stage {
  if (p == null)  return "idle"
  if (p >= 100)   return "complete"
  if (p >= 75)    return "deduplicating"
  if (p >= 50)    return "scoring"
  if (p >= 25)    return "parsing"
  return "uploading"
}

function stageIndex(s: Stage): number {
  return ["idle", "uploading", "parsing", "scoring", "deduplicating", "complete"].indexOf(s)
}

async function fetchHistory(): Promise<{ jobs: ImportJob[] }> {
  const res = await fetch("/api/import/history", { credentials: "include" })
  if (!res.ok) throw new Error("Failed to load import history")
  return res.json()
}

// ── Pipeline step indicator ──────────────────────────────────────────────────

const PIPELINE_STEPS: { stage: Stage; label: string; icon: typeof CloudUpload }[] = [
  { stage: "uploading",     label: "Uploading",     icon: CloudUpload },
  { stage: "parsing",       label: "Parsing",       icon: Cog },
  { stage: "scoring",       label: "Scoring",       icon: Sparkles },
  { stage: "deduplicating", label: "Deduplicating", icon: ShieldCheck },
  { stage: "complete",      label: "Completed",     icon: CheckCircle2 },
]

function PipelineSteps({ current }: { current: Stage }) {
  const cur = stageIndex(current)
  return (
    <div className="grid grid-cols-5 gap-0 items-start">
      {PIPELINE_STEPS.map((step, i) => {
        const idx     = stageIndex(step.stage)
        const done    = cur > idx || current === "complete"
        const active  = cur === idx && current !== "complete"
        const Icon    = step.icon

        const bg =
          done   ? "linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)" :
          active ? "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)" :
                   "linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%)"
        const shadow =
          done   ? "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(16,185,129,0.30)" :
          active ? "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(14,165,233,0.30)" :
                   "inset 0 1px 0 rgba(255,255,255,0.85)"
        const iconColor = done || active ? "white" : "#94A3B8"

        return (
          <div key={step.stage} className="flex flex-col items-center relative">
            {/* connector line — to the right of every step except last */}
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={`absolute top-7 left-[60%] right-[-40%] h-[2px] ${cur > idx ? "bg-emerald-400" : "bg-slate-200"} transition-colors duration-500`} />
            )}
            <div
              className={`relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${active ? "scale-110" : ""}`}
              style={{ background: bg, boxShadow: shadow }}
            >
              <Icon className="w-6 h-6" style={{ color: iconColor }} strokeWidth={2.5} />
              {active && (
                <span className="absolute inset-0 rounded-full ring-4 ring-sky-200/60 animate-pulse" />
              )}
            </div>
            <p className={`mt-2.5 text-[12.5px] font-semibold ${done ? "text-emerald-700" : active ? "text-sky-700" : "text-ink-muted"}`}>
              {step.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ── Import From — left column ────────────────────────────────────────────────

function ImportFromCard({
  uploading,
  onCsvClick,
}: {
  uploading: boolean
  onCsvClick: () => void
}) {
  return (
    <div className="glass-2 gloss-edge rounded-2xl p-6">
      <h2 className="text-[15px] font-semibold text-ink mb-4">Import From</h2>
      <div className="space-y-2.5">

        {/* CSV File — active */}
        <button
          type="button"
          disabled={uploading}
          onClick={onCsvClick}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed transition-all text-left
            ${uploading ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-emerald-200 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/60 cursor-pointer"}
          `}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #A7F3D0 0%, #6EE7B7 100%)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85), 0 2px 6px rgba(16,185,129,0.18)",
            }}
          >
            <FileType2 className="w-5 h-5 text-emerald-700" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink leading-tight">CSV File</p>
            <p className="text-[11.5px] text-ink-muted mt-0.5">Upload — max 10 MB</p>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 shrink-0">Click ↑</span>
        </button>

        {/* Google Sheets — coming soon */}
        <div className="w-full flex items-center gap-3 p-3 rounded-xl border border-hairline bg-white/40">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85)",
            }}
          >
            <FileSpreadsheet className="w-5 h-5 text-sky-700" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink leading-tight">Google Sheets</p>
            <p className="text-[11.5px] text-ink-muted mt-0.5">Live sync from any sheet</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
            <Lock className="w-2.5 h-2.5" /> Soon
          </span>
        </div>

        {/* Manual Entry — coming soon */}
        <div className="w-full flex items-center gap-3 p-3 rounded-xl border border-hairline bg-white/40">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #DDD6FE 0%, #C4B5FD 100%)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85)",
            }}
          >
            <UserPlus className="w-5 h-5 text-violet-700" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink leading-tight">Manual Entry</p>
            <p className="text-[11.5px] text-ink-muted mt-0.5">Add a single lead by hand</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
            <Lock className="w-2.5 h-2.5" /> Soon
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Upload form (the right column when idle) ────────────────────────────────

function UploadForm({
  sources, stages, sourceId, stageId, sessionName,
  setSourceId, setStageId, setSessionName,
  uploading, metaError, onRetryMeta,
}: {
  sources: LeadSource[]; stages: PipelineStage[]
  sourceId: string; stageId: string; sessionName: string
  setSourceId: (v: string) => void; setStageId: (v: string) => void; setSessionName: (v: string) => void
  uploading: boolean
  metaError: boolean; onRetryMeta: () => void
}) {
  const inputCls = "w-full h-10 px-3 rounded-lg border border-hairline-strong bg-white text-[13px] text-ink outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-colors disabled:opacity-50"
  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4"
          style={{
            background: "linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%)",
            boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85)",
          }}
        >
          <CloudUpload className="w-8 h-8 text-ink-muted" strokeWidth={1.6} />
        </div>
        <p className="text-[14px] font-semibold text-ink">Ready when you are</p>
        <p className="text-[12.5px] text-ink-muted mt-1">
          Pick a source + stage, then click <span className="font-semibold text-emerald-700">CSV File</span> on the left to upload.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10.5px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Batch Name</label>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g. MagicBricks April"
            disabled={uploading}
            className={inputCls + " placeholder:text-ink-faint"}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10.5px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Lead Source</label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            disabled={!sources.length || uploading}
            className={inputCls + " cursor-pointer"}
          >
            {sources.length === 0 && <option value="">{metaError ? "Couldn't load" : "Loading…"}</option>}
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10.5px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Initial Stage</label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            disabled={!stages.length || uploading}
            className={inputCls + " cursor-pointer"}
          >
            {stages.length === 0 && <option value="">{metaError ? "Couldn't load" : "Loading…"}</option>}
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {metaError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3.5 py-2.5">
          <p className="text-[12px] text-rose-600">Couldn&apos;t load sources or stages.</p>
          <button
            onClick={onRetryMeta}
            disabled={uploading}
            className="h-7 px-3 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold transition-all active:scale-[0.97] disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

// ── Live progress (right column when uploading) ──────────────────────────────

function LiveProgress({ stage, progress, fileName }: { stage: Stage; progress: number | null; fileName: string }) {
  const stageLabel =
    stage === "uploading"     ? "Uploading file…" :
    stage === "parsing"       ? "Parsing CSV…" :
    stage === "scoring"       ? "Scoring leads…" :
    stage === "deduplicating" ? "Checking for duplicates…" :
    stage === "complete"      ? "Done!" :
                                "Idle"
  return (
    <div className="rounded-xl bg-white/60 border border-hairline p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[14px] font-semibold text-ink truncate pr-3">{stageLabel}</p>
        <span className="text-[14px] font-bold text-emerald-600 tabular-nums shrink-0">{progress ?? 0}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width:      `${progress ?? 0}%`,
            background: "linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)",
            boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.4)",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
        <span className="truncate pr-2">{fileName || "Processing…"}</span>
        <span className="shrink-0">Hold tight — we finish in seconds.</span>
      </div>
    </div>
  )
}

// ── 5-tile Ingestion Summary ─────────────────────────────────────────────────

function SummaryTile({
  label, value, icon, iconBg, iconColor,
}: {
  label: string; value: React.ReactNode; icon: React.ReactNode; iconBg: string; iconColor: string
}) {
  return (
    <div className="rounded-xl bg-white/70 border border-hairline p-4 text-center">
      <div
        className="w-11 h-11 rounded-full mx-auto flex items-center justify-center mb-3"
        style={{
          background: iconBg,
          boxShadow:  `inset 0 1px 0 rgba(255,255,255,0.85), 0 3px 8px ${iconColor}22`,
        }}
      >
        <span style={{ color: iconColor }}>{icon}</span>
      </div>
      <p className="text-[11.5px] text-ink-muted font-medium">{label}</p>
      <p className="text-[22px] font-bold text-ink tabular-nums mt-1 leading-none">{value}</p>
    </div>
  )
}

function IngestionSummary({ job, isLoading }: { job: ImportJob | null; isLoading: boolean }) {
  return (
    <div className="glass-2 gloss-edge rounded-2xl p-6">
      <h2 className="text-[15px] font-semibold text-ink mb-5">Ingestion Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryTile
          label="Total Rows"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.total_rows ?? 0).toLocaleString("en-IN")}
          icon={<Users className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)"
          iconColor="#0284C7"
        />
        <SummaryTile
          label="New Leads"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.inserted ?? 0).toLocaleString("en-IN")}
          icon={<CheckCircle2 className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #A7F3D0 0%, #6EE7B7 100%)"
          iconColor="#059669"
        />
        <SummaryTile
          label="Duplicates Removed"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.duplicates ?? 0).toLocaleString("en-IN")}
          icon={<ShieldCheck className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #FED7AA 0%, #FDBA74 100%)"
          iconColor="#EA580C"
        />
        <SummaryTile
          label="Hot Leads (A/B)"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.high_intent_count ?? 0).toLocaleString("en-IN")}
          icon={<Star className="w-5 h-5 fill-current" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #DDD6FE 0%, #C4B5FD 100%)"
          iconColor="#7C3AED"
        />
        <SummaryTile
          label="Pipeline Value"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : `₹${formatINR(job?.total_value ?? 0)}`}
          icon={<IndianRupee className="w-5 h-5" strokeWidth={2} />}
          iconBg="linear-gradient(180deg, #BBF7D0 0%, #86EFAC 100%)"
          iconColor="#059669"
        />
      </div>
    </div>
  )
}

// ── Status badge for history table ───────────────────────────────────────────

function StatusBadge({ status }: { status: ImportJob["status"] }) {
  if (status === "COMPLETE") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> Complete
    </span>
  )
  if (status === "FAILED") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 ring-1 ring-red-200 px-2 py-0.5 rounded-full">
      <AlertCircle className="w-3 h-3" /> Failed
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> Processing
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router            = useRouter()
  const { data: currentUser } = useCurrentUser()
  const isManager         = currentUser?.user.role === "ADMIN" || currentUser?.user.role === "MANAGER"

  // Form state
  const [sources,     setSources]     = useState<LeadSource[]>([])
  const [stages,      setStages]      = useState<PipelineStage[]>([])
  const [sourceId,    setSourceId]    = useState<string>("")
  const [stageId,     setStageId]     = useState<string>("")
  const [sessionName, setSessionName] = useState<string>("")

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState<number | null>(null)
  const [fileName,  setFileName]  = useState<string>("")
  const [result,    setResult]    = useState<{
    jobId: string
    inserted: number; duplicates: number; errors: number
    high_intent_count: number; total_value: number; total_rows: number | null
    errorDetail: ErrorDetail | null
  } | null>(null)

  const fileRef     = useRef<HTMLInputElement>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load sources + stages (retryable, so a failed fetch doesn't leave the
  // Source/Stage selects stuck on "Loading…" forever — audit B8 dead-end).
  const [metaError, setMetaError] = useState(false)
  const loadMeta = useCallback(() => {
    setMetaError(false)
    Promise.all([
      fetch("/api/lead-sources",    { credentials: "include" }).then((r) => { if (!r.ok) throw new Error(); return r.json() }),
      fetch("/api/pipeline/stages", { credentials: "include" }).then((r) => { if (!r.ok) throw new Error(); return r.json() }),
    ]).then(([srcData, stgData]) => {
      const srcs = (srcData.sources ?? []) as LeadSource[]
      const stgs = (stgData.stages  ?? []) as PipelineStage[]
      setSources(srcs)
      setStages(stgs.sort((a, b) => a.order - b.order))
      if (srcs.length) setSourceId(srcs[0].id)
      if (stgs.length) setStageId(stgs[0].id)
    }).catch(() => {
      setMetaError(true)
      toast.error("Failed to load lead sources or pipeline stages")
    })
  }, [])
  useEffect(() => { loadMeta() }, [loadMeta])

  // History
  const { data: historyData, isLoading: historyLoading } = useQuery<{ jobs: ImportJob[] }>({
    queryKey:  ["import-history", refreshKey],
    queryFn:   fetchHistory,
    staleTime: 30_000,
  })
  const jobs = historyData?.jobs ?? []
  const lastJob = jobs[0] ?? null

  function handleCsvClick() {
    if (uploading) return
    if (!sourceId || !stageId) {
      toast.error("Please select a lead source and initial stage first")
      return
    }
    fileRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    setFileName(file.name)
    setUploading(true)
    setProgress(0)
    setResult(null)

    const ticker = setInterval(() => {
      setProgress((p) => (p !== null && p < 90 ? p + 3 : p))
    }, 400)

    try {
      const form = new FormData()
      form.append("file",      file)
      form.append("source_id", sourceId)
      form.append("stage_id",  stageId)
      if (sessionName.trim()) form.append("name", sessionName.trim())

      const res = await fetch("/api/import/csv", { method: "POST", body: form, credentials: "include" })
      clearInterval(ticker)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "Upload failed. Please check your CSV and try again.")
        setProgress(null); setUploading(false)
        return
      }

      const { jobId } = await res.json()
      const statusRes = await fetch(`/api/import/status/${jobId}`, { credentials: "include" })
      const job: ImportJob = statusRes.ok ? await statusRes.json() : null

      setProgress(100)

      if (job) {
        setResult({
          jobId:             jobId,
          inserted:          job.inserted,
          duplicates:        job.duplicates,
          errors:            job.errors,
          high_intent_count: job.high_intent_count ?? 0,
          total_value:       job.total_value ?? 0,
          total_rows:        job.total_rows ?? null,
          errorDetail:       job.error_detail ?? null,
        })
        if (job.inserted > 0) {
          toast.success(`Import complete — ${job.inserted} lead${job.inserted === 1 ? "" : "s"} added`)
        } else {
          toast.info(`Import complete — 0 new leads (${job.duplicates} duplicates)`)
        }
      }
      setRefreshKey((k) => k + 1)
    } catch {
      clearInterval(ticker)
      toast.error("Unexpected error. Please try again.")
      setProgress(null)
    } finally {
      setUploading(false)
    }
  }

  if (currentUser && !isManager) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-2">
        <p className="text-[14px] font-semibold text-ink">Access Restricted</p>
        <p className="text-[13px] text-ink-muted">Only managers and admins can import leads.</p>
        <Link href="/leads" className="inline-block mt-3 text-[13px] text-sky-600 hover:underline">Back to Leads</Link>
      </div>
    )
  }

  // What does the right column show?
  const stage = uploading || (progress != null && progress < 100) ? stageFromProgress(progress) : (result ? "complete" : "idle")
  const showSummary = result || lastJob

  // Coerce result OR lastJob into the ImportJob shape that IngestionSummary needs
  const summaryJob: ImportJob | null = result
    ? {
        id: result.jobId, status: "COMPLETE", name: null, file_name: fileName,
        source_name: null, total_rows: result.total_rows, inserted: result.inserted,
        duplicates: result.duplicates, errors: result.errors, progress_pct: 100,
        high_intent_count: result.high_intent_count, total_value: result.total_value,
        error_detail: result.errorDetail, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      }
    : lastJob

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Hidden file input ─────────────────────────────────────────────── */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)",
            boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(14,165,233,0.25)",
          }}
        >
          <Download className="w-6 h-6 text-sky-700" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-[32px] md:text-[36px] font-bold text-ink tracking-[-0.025em] leading-[1.05]">Lead Ingestion</h1>
          <p className="text-[14px] text-ink-soft mt-2 leading-relaxed max-w-[560px]">
            Import from CSV, Google Sheets, or add manually. Indian phone normalisation + dedup built in.
          </p>
        </div>
      </div>

      {/* ── 2-col: Import From | Ingestion in Progress ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <ImportFromCard uploading={uploading} onCsvClick={handleCsvClick} />

        <div className="lg:col-span-2 glass-2 gloss-edge rounded-2xl p-6">
          <h2 className="text-[15px] font-semibold text-ink mb-5">
            {stage === "idle" ? "Get started" : stage === "complete" ? "Ingestion complete" : "Ingestion in Progress"}
          </h2>

          {/* Pipeline steps — always visible */}
          <PipelineSteps current={stage} />

          {/* Progress / form */}
          <div className="mt-6">
            {stage === "idle" ? (
              <UploadForm
                sources={sources} stages={stages}
                sourceId={sourceId} stageId={stageId} sessionName={sessionName}
                setSourceId={setSourceId} setStageId={setStageId} setSessionName={setSessionName}
                uploading={uploading}
                metaError={metaError} onRetryMeta={loadMeta}
              />
            ) : stage === "complete" && result ? (
              <div className="rounded-xl bg-white/60 border border-hairline p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[14px] font-semibold text-emerald-700">Done!</p>
                  <span className="text-[14px] font-bold text-emerald-600 tabular-nums">100%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: "100%", background: "linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)" }} />
                </div>
                <p className="text-[11.5px] text-ink-muted mt-2 truncate">{fileName || "Your import"}</p>
              </div>
            ) : (
              <LiveProgress stage={stage} progress={progress} fileName={fileName} />
            )}
          </div>
        </div>
      </div>

      {/* ── Ingestion Summary (5-tile) ───────────────────────────────────── */}
      {showSummary && <IngestionSummary job={summaryJob} isLoading={false} />}

      {/* ── Success callout (post-import) ─────────────────────────────────── */}
      {result && result.inserted > 0 && (
        <div className="glass-2 gloss-edge rounded-2xl p-5 flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(16,185,129,0.30)",
            }}
          >
            <CheckCircle2 className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-ink">Ingestion completed successfully!</p>
            <p className="text-[13px] text-ink-soft mt-0.5">Leads are now live in your Priority Queue.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/leads?batch=${result.jobId}`}
              className="h-10 px-4 rounded-xl text-[13px] font-semibold text-sky-700 border border-sky-200 bg-white/70 hover:bg-sky-50 transition-colors"
            >
              View this batch
            </Link>
            <button
              onClick={() => router.push("/queue")}
              className="btn-gloss-primary inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold text-white"
              style={{
                background: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)",
                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 16px rgba(14,165,233,0.30)",
              }}
            >
              Start executing <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── No-new-leads callout (when result.inserted == 0) ──────────────── */}
      {result && result.inserted === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" strokeWidth={2.2} />
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-ink">No new leads added</p>
            <p className="text-[12px] text-ink-soft mt-0.5">
              {result.duplicates > 0 && `${result.duplicates} duplicates skipped. `}
              {result.errors     > 0 && `${result.errors} rows had errors.`}
            </p>
          </div>
          <button onClick={() => setResult(null)} className="text-[12px] text-ink-soft hover:text-ink shrink-0">Try another</button>
        </div>
      )}

      {/* ── Error detail ─────────────────────────────────────────────────── */}
      {result?.errorDetail && result.errorDetail.total_errors > 0 && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
          <p className="text-[12px] font-semibold text-red-600 uppercase tracking-wide mb-2">
            {result.errorDetail.total_errors} row{result.errorDetail.total_errors === 1 ? "" : "s"} skipped
            {result.errorDetail.truncated && ` (showing first ${result.errorDetail.shown})`}
          </p>
          {result.errorDetail.rows.map((msg, i) => (
            <p key={i} className="text-[12px] text-red-700 font-mono leading-relaxed">{msg}</p>
          ))}
        </div>
      )}

      {/* ── Regrade utility ──────────────────────────────────────────────── */}
      <RegradeButton />

      {/* ── Import History ───────────────────────────────────────────────── */}
      <div className="glass-2 gloss-edge rounded-2xl p-6">
        <h2 className="text-[15px] font-semibold text-ink mb-4">Import History</h2>
        {historyLoading ? (
          <div className="space-y-2">
            {[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={CloudUpload} title="No imports yet" description="Upload a CSV above — your import history will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left  py-2 pr-4 text-[10.5px] font-semibold text-ink-muted uppercase tracking-[0.08em]">Batch</th>
                  <th className="text-left  py-2 pr-4 text-[10.5px] font-semibold text-ink-muted uppercase tracking-[0.08em]">Date</th>
                  <th className="text-left  py-2 pr-4 text-[10.5px] font-semibold text-ink-muted uppercase tracking-[0.08em]">Status</th>
                  <th className="text-right py-2 pr-4 text-[10.5px] font-semibold text-ink-muted uppercase tracking-[0.08em]">Added</th>
                  <th className="text-right py-2 pr-4 text-[10.5px] font-semibold text-ink-muted uppercase tracking-[0.08em]">Hot</th>
                  <th className="text-right py-2 pr-4 text-[10.5px] font-semibold text-ink-muted uppercase tracking-[0.08em]">Value</th>
                  <th className="text-right py-2     text-[10.5px] font-semibold text-ink-muted uppercase tracking-[0.08em]">Dupes</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => <HistoryRow key={job.id} job={job} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryRow({ job }: { job: ImportJob }) {
  return (
    <tr className="border-b border-hairline last:border-0 hover:bg-sky-50/30 transition-colors">
      <td className="py-3 pr-4">
        <Link href={`/leads?batch=${job.id}`} className="group">
          <p className="text-[13px] font-semibold text-ink group-hover:text-sky-600 transition-colors">{job.name ?? "Unnamed import"}</p>
          {job.file_name && <p className="text-[11px] text-ink-muted mt-0.5">{job.file_name}</p>}
        </Link>
      </td>
      <td className="py-3 pr-4 text-[12px] text-ink-muted whitespace-nowrap">
        {new Date(job.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
      </td>
      <td className="py-3 pr-4"><StatusBadge status={job.status} /></td>
      <td className="py-3 pr-4 text-right text-[13px] tabular-nums font-semibold text-emerald-700">{job.inserted}</td>
      <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-violet-600 font-semibold">{job.high_intent_count > 0 ? job.high_intent_count : "—"}</td>
      <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-emerald-700">{job.total_value > 0 ? `₹${formatINR(job.total_value)}` : "—"}</td>
      <td className="py-3     text-right text-[13px] tabular-nums text-orange-600">{job.duplicates > 0 ? job.duplicates : "—"}</td>
    </tr>
  )
}

function RegradeButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle")
  const [result, setResult] = useState<{ updated: number; total: number } | null>(null)

  async function handleRegrade() {
    setStatus("loading")
    try {
      const res = await fetch("/api/admin/regrade", { method: "POST", credentials: "include" })
      const data = await res.json()
      setResult(data)
      setStatus("done")
    } catch {
      setStatus("idle")
      toast.error("Regrade failed. Please try again.")
    }
  }

  return (
    <div className="rounded-2xl bg-white/70 border border-hairline px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
          <RotateCw className="w-4 h-4 text-violet-600" strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink">Regrade all leads</p>
          <p className="text-[12px] text-ink-muted mt-0.5">
            {status === "done" && result
              ? `Updated ${result.updated} of ${result.total} leads`
              : "Re-run scoring on every lead with the latest grade thresholds"}
          </p>
        </div>
      </div>
      <button
        onClick={handleRegrade}
        disabled={status === "loading"}
        className={`h-9 px-4 rounded-lg text-[12px] font-semibold transition-colors shrink-0
          ${status === "done" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 hover:bg-slate-200 text-ink-soft disabled:opacity-50"}`}
      >
        {status === "loading" ? "Regrading…" : status === "done" ? "Done" : "Run regrade"}
      </button>
    </div>
  )
}
