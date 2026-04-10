"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronLeft, Upload, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
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
  id:           string
  status:       "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED"
  total_rows:   number | null
  inserted:     number
  duplicates:   number
  errors:       number
  progress_pct: number
  error_detail: ErrorDetail | null
  created_at:   string
  completed_at: string | null
}

// ── History fetch ─────────────────────────────────────────────────────────────

async function fetchHistory(): Promise<{ jobs: ImportJob[] }> {
  const res = await fetch("/api/import/history", { credentials: "include" })
  if (!res.ok) throw new Error("Failed to load import history")
  return res.json()
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ImportJob["status"] }) {
  if (status === "COMPLETE")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Complete
      </span>
    )
  if (status === "FAILED")
    return (
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

const CARD_SHADOW = "shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]"

// ── Upload section ────────────────────────────────────────────────────────────

function UploadSection({ onComplete }: { onComplete: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [sources,   setSources]   = useState<LeadSource[]>([])
  const [stages,    setStages]    = useState<PipelineStage[]>([])
  const [sourceId,  setSourceId]  = useState<string>("")
  const [stageId,   setStageId]   = useState<string>("")
  const [progress,  setProgress]  = useState<number | null>(null)
  const [result,    setResult]    = useState<{ inserted: number; duplicates: number; errors: number; errorDetail: ErrorDetail | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch sources + stages on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/lead-sources",    { credentials: "include" }).then((r) => r.json()),
      fetch("/api/pipeline/stages", { credentials: "include" }).then((r) => r.json()),
    ]).then(([srcData, stgData]) => {
      const srcs = (srcData.sources  ?? []) as LeadSource[]
      const stgs = (stgData.stages   ?? []) as PipelineStage[]
      setSources(srcs)
      setStages(stgs.sort((a, b) => a.order - b.order))
      if (srcs.length) setSourceId(srcs[0].id)
      if (stgs.length) setStageId(stgs[0].id)
    }).catch(() => {
      toast.error("Failed to load lead sources or pipeline stages")
    })
  }, [])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = "" // allow re-selecting same file

    if (!sourceId || !stageId) {
      toast.error("Please select a lead source and initial stage first")
      return
    }

    setUploading(true)
    setProgress(0)
    setResult(null)

    // Simulate progress while uploading (actual progress comes from the API response)
    const ticker = setInterval(() => {
      setProgress((p) => (p !== null && p < 90 ? p + 2 : p))
    }, 600)

    try {
      const form = new FormData()
      form.append("file",      file)
      form.append("source_id", sourceId)
      form.append("stage_id",  stageId)

      const res = await fetch("/api/import/csv", { method: "POST", body: form, credentials: "include" })

      clearInterval(ticker)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "Upload failed. Please check your CSV and try again.")
        setProgress(null)
        setUploading(false)
        return
      }

      // The route processes inline — by the time we get here, import is done.
      // Fetch the final job status to show the result summary.
      const { jobId } = await res.json()
      const statusRes = await fetch(`/api/import/status/${jobId}`, { credentials: "include" })
      const job: ImportJob = statusRes.ok ? await statusRes.json() : null

      setProgress(100)

      if (job) {
        setResult({
          inserted:    job.inserted,
          duplicates:  job.duplicates,
          errors:      job.errors,
          errorDetail: job.error_detail ?? null,
        })
        if (job.inserted > 0) {
          toast.success(`Import complete — ${job.inserted} lead${job.inserted === 1 ? "" : "s"} added`)
        } else {
          toast.info(`Import complete — 0 new leads (${job.duplicates} duplicates)`)
        }
      }

      onComplete()
    } catch {
      clearInterval(ticker)
      toast.error("Unexpected error. Please try again.")
      setProgress(null)
    } finally {
      setUploading(false)
    }
  }

  const selectClass = `
    w-full h-9 px-3 rounded-lg border border-slate-200 bg-white
    text-[13px] text-slate-800
    outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100
    transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
  `

  return (
    <div className={`rounded-xl bg-white ${CARD_SHADOW} p-6 space-y-5`}>
      <div>
        <h2 className="text-[14px] font-semibold text-slate-800">Upload CSV</h2>
        <p className="text-[12px] text-slate-400 mt-0.5">
          Required columns: <strong className="text-slate-600">Name</strong> and{" "}
          <strong className="text-slate-600">Phone</strong>. All other fields are optional.
        </p>
      </div>

      {/* Source + Stage */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
            Lead Source
          </label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            disabled={!sources.length || uploading}
            className={selectClass}
          >
            {sources.length === 0 && <option value="">Loading…</option>}
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
            Initial Stage
          </label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            disabled={!stages.length || uploading}
            className={selectClass}
          >
            {stages.length === 0 && <option value="">Loading…</option>}
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`
          rounded-xl border-2 border-dashed border-slate-200 p-8 text-center
          transition-colors ${uploading ? "opacity-60" : "hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer"}
        `}
        onClick={() => !uploading && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFile}
          disabled={uploading}
        />
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <Upload className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-[13px] font-medium text-slate-600">
          {uploading ? "Processing…" : "Click to choose a CSV file"}
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          {uploading ? "This may take a moment for large files" : "Max 10 MB · UTF-8 or Windows-1252 encoding"}
        </p>
      </div>

      {/* Progress bar */}
      {uploading && progress !== null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-slate-500">Importing leads…</span>
            <span className="text-[12px] font-semibold text-slate-700 tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Result summary */}
      {!uploading && result && (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[20px] font-bold text-emerald-700 tabular-nums">{result.inserted}</p>
              <p className="text-[11px] text-emerald-600">Added</p>
            </div>
            <div>
              <p className="text-[20px] font-bold text-amber-600 tabular-nums">{result.duplicates}</p>
              <p className="text-[11px] text-amber-600">Duplicates</p>
            </div>
            <div>
              <p className="text-[20px] font-bold text-slate-500 tabular-nums">{result.errors}</p>
              <p className="text-[11px] text-slate-400">Errors</p>
            </div>
          </div>
          {result.errors > 0 && result.errorDetail && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3 space-y-1">
              <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-2">
                {result.errorDetail.total_errors} row{result.errorDetail.total_errors === 1 ? "" : "s"} skipped
                {result.errorDetail.truncated && ` (showing first ${result.errorDetail.shown})`}
              </p>
              {result.errorDetail.rows.map((msg, i) => (
                <p key={i} className="text-[12px] text-red-700 font-mono leading-relaxed">
                  {msg}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── History row (with expandable error detail) ────────────────────────────────

function HistoryRow({ job }: { job: ImportJob }) {
  return (
    <>
      <tr className="border-b border-slate-50 last:border-0">
        <td className="py-3 pr-4 text-[12px] text-slate-400 whitespace-nowrap">
          {new Date(job.created_at).toLocaleString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </td>
        <td className="py-3 pr-4">
          <StatusBadge status={job.status} />
        </td>
        <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-slate-600">
          {job.total_rows ?? "—"}
        </td>
        <td className="py-3 pr-4 text-right text-[13px] tabular-nums font-semibold text-emerald-700">
          {job.inserted}
        </td>
        <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-amber-600">
          {job.duplicates}
        </td>
        <td className="py-3 text-right text-[13px] tabular-nums text-slate-400">
          {job.errors}
        </td>
      </tr>
    </>
  )
}

// ── History section ───────────────────────────────────────────────────────────

function HistorySection({ refreshKey }: { refreshKey: number }) {
  const { data, isLoading } = useQuery<{ jobs: ImportJob[] }>({
    queryKey:  ["import-history", refreshKey],
    queryFn:   fetchHistory,
    staleTime: 30_000,
  })

  const jobs = data?.jobs ?? []

  if (isLoading) {
    return (
      <div className={`rounded-xl bg-white ${CARD_SHADOW} p-6 space-y-3`}>
        <h2 className="text-[14px] font-semibold text-slate-800">Import History</h2>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className={`rounded-xl bg-white ${CARD_SHADOW} p-6 space-y-4`}>
      <h2 className="text-[14px] font-semibold text-slate-800">Import History</h2>

      {jobs.length === 0 ? (
        <p className="text-[13px] text-slate-400 py-4 text-center">No imports yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 pr-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                <th className="text-left py-2 pr-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-right py-2 pr-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total</th>
                <th className="text-right py-2 pr-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Added</th>
                <th className="text-right py-2 pr-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Dupes</th>
                <th className="text-right py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Errors</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <HistoryRow key={job.id} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { data: currentUser } = useCurrentUser()
  const [refreshKey, setRefreshKey] = useState(0)

  const isManager = currentUser?.user.role === "ADMIN" || currentUser?.user.role === "MANAGER"

  if (currentUser && !isManager) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-2">
        <p className="text-[14px] font-semibold text-slate-800">Access Restricted</p>
        <p className="text-[13px] text-slate-400">Only managers and admins can import leads.</p>
        <Link href="/leads" className="inline-block mt-3 text-[13px] text-indigo-600 hover:underline">
          Back to Leads
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/leads"
          className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 tracking-tight">Import Leads</h1>
          <p className="text-[12px] text-slate-400 mt-0.5">
            Upload a CSV file to bulk-import leads into your pipeline.
          </p>
        </div>
      </div>

      {/* Upload */}
      <UploadSection onComplete={() => setRefreshKey((k) => k + 1)} />

      {/* History */}
      <HistorySection refreshKey={refreshKey} />

    </div>
  )
}
