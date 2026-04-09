"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useImportStatus } from "@/hooks/useImportStatus"
import { useCurrentUser } from "@/hooks/useCurrentUser"

// ── Types ────────────────────────────────────────────────────────────────────

interface LeadSource   { id: string; name: string }
interface PipelineStage { id: string; name: string; order: number }

interface ImportJob {
  id:           string
  status:       "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED"
  total_rows:   number | null
  inserted:     number
  duplicates:   number
  errors:       number
  progress_pct: number
  error_detail: string | null
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
  if (status === "COMPLETE")   return <Badge className="bg-green-100 text-green-800 border-green-200">Complete</Badge>
  if (status === "FAILED")     return <Badge className="bg-red-100 text-red-800 border-red-200">Failed</Badge>
  if (status === "PROCESSING") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Processing</Badge>
  return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Pending</Badge>
}

// ── Upload section ────────────────────────────────────────────────────────────

function UploadSection({ onComplete }: { onComplete: (jobId: string) => void }) {
  const [uploading, setUploading]   = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [sources, setSources]       = useState<LeadSource[]>([])
  const [stages, setStages]         = useState<PipelineStage[]>([])
  const [sourceId, setSourceId]     = useState<string>("")
  const [stageId, setStageId]       = useState<string>("")

  const { data: jobStatus } = useImportStatus(activeJobId)

  // Fetch sources + stages on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/lead-sources",    { credentials: "include" }).then((r) => r.json()),
      fetch("/api/pipeline/stages", { credentials: "include" }).then((r) => r.json()),
    ]).then(([srcData, stgData]) => {
      const srcs = srcData.sources  ?? []
      const stgs = stgData.stages   ?? []
      setSources(srcs)
      setStages(stgs)
      if (srcs.length) setSourceId(srcs[0].id)
      if (stgs.length) setStageId(stgs[0].id)
    }).catch(() => {
      toast.error("Failed to load lead sources or pipeline stages")
    })
  }, [])

  // When job completes, notify parent to refresh history
  useEffect(() => {
    if (!jobStatus) return
    if (jobStatus.status === "COMPLETE") {
      toast.success(`Import complete — ${jobStatus.inserted} leads added`)
      onComplete(jobStatus.id)
      setActiveJobId(null)
    } else if (jobStatus.status === "FAILED") {
      toast.error("Import failed. Please check your CSV and try again.")
      setActiveJobId(null)
    }
  }, [jobStatus?.status, jobStatus?.id, onComplete])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!sourceId || !stageId) {
      toast.error("Please select a lead source and pipeline stage first")
      return
    }

    setUploading(true)
    e.target.value = "" // reset input so same file can be re-selected

    const form = new FormData()
    form.append("file",      file)
    form.append("source_id", sourceId)
    form.append("stage_id",  stageId)

    const res = await fetch("/api/import/csv", { method: "POST", body: form, credentials: "include" })
    setUploading(false)

    if (res.ok) {
      const { jobId } = await res.json()
      setActiveJobId(jobId)
      toast.success("Upload started — processing in background…")
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Upload failed. Please try again.")
    }
  }

  const isActive = !!activeJobId && jobStatus && (jobStatus.status === "PENDING" || jobStatus.status === "PROCESSING")

  return (
    <div className="rounded-lg border bg-card p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold">Upload CSV</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Required columns: <strong>Name</strong> and <strong>Phone</strong>. All other fields are optional.
          Supports UTF-8 and Windows-1252 encoded files.
        </p>
      </div>

      {/* Source + Stage selectors */}
      <div className="flex gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Lead Source</label>
          <Select value={sourceId} onValueChange={(v) => setSourceId(v ?? "")} disabled={!sources.length || isActive || uploading}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select source…" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Initial Stage</label>
          <Select value={stageId} onValueChange={(v) => setStageId(v ?? "")} disabled={!stages.length || isActive || uploading}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select stage…" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Drop zone */}
      <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Drag & drop a CSV file, or click to browse</p>
        <input
          type="file"
          accept=".csv"
          className="hidden"
          id="csv-upload-input"
          onChange={handleFile}
          disabled={uploading || !!isActive}
        />
        <label
          htmlFor="csv-upload-input"
          className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors ${(uploading || isActive) ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Uploading…" : "Choose CSV File"}
        </label>
      </div>

      {/* Progress while job is active */}
      {isActive && jobStatus && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Processing…</span>
            <span className="font-medium">{jobStatus.progress_pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${jobStatus.progress_pct}%` }}
            />
          </div>
          {jobStatus.total_rows != null && (
            <p className="text-xs text-muted-foreground">
              {jobStatus.inserted} of {jobStatus.total_rows} rows imported
              {jobStatus.duplicates > 0 && ` · ${jobStatus.duplicates} duplicates skipped`}
            </p>
          )}
        </div>
      )}
    </div>
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
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <h2 className="text-base font-semibold">Import History</h2>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <h2 className="text-base font-semibold">Import History</h2>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No imports yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-4 font-medium">Date</th>
                <th className="text-left py-2 pr-4 font-medium">Status</th>
                <th className="text-right py-2 pr-4 font-medium">Total</th>
                <th className="text-right py-2 pr-4 font-medium">Inserted</th>
                <th className="text-right py-2 pr-4 font-medium">Duplicates</th>
                <th className="text-right py-2 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                    {new Date(job.created_at).toLocaleString("en-IN", {
                      day:    "2-digit",
                      month:  "short",
                      year:   "numeric",
                      hour:   "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {job.total_rows ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-green-700 font-medium">
                    {job.inserted}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-yellow-700">
                    {job.duplicates}
                  </td>
                  <td className="py-3 text-right tabular-nums text-red-700">
                    {job.errors}
                  </td>
                </tr>
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

  function handleUploadComplete() {
    // Bump key to force history query refetch
    setRefreshKey((k) => k + 1)
  }

  if (currentUser && !isManager) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-2">
        <p className="font-medium">Access Restricted</p>
        <p className="text-sm text-muted-foreground">Only managers and admins can import leads.</p>
        <Link href="/leads"><Button variant="outline" size="sm">Back to Leads</Button></Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/leads" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Import Leads</h1>
          <p className="text-sm text-muted-foreground">Upload a CSV file to bulk-import leads into your pipeline.</p>
        </div>
      </div>

      {/* Upload */}
      <UploadSection onComplete={handleUploadComplete} />

      {/* History */}
      <HistorySection refreshKey={refreshKey} />
    </div>
  )
}
