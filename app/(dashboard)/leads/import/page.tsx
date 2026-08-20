"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Papa from "papaparse"
import { mapHeader } from "@/lib/import/column-map"
import {
  Download, FileSpreadsheet, UserPlus, X,
  CloudUpload, Cog, ShieldCheck, Users, CheckCircle2,
  AlertCircle, Clock, Star, IndianRupee, ArrowRight,
  Sparkles, RotateCw, Loader2,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/EmptyState"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { sourceAgeToDate, SOURCE_AGE_OPTIONS } from "@/lib/scoring/freshness"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { IntakeReport } from "@/components/intake/IntakeReport"
import { trackFunnel } from "@/lib/analytics/funnel"
import type { IntakeReport as IntakeReportData } from "@/lib/intake/types"
import { patchIntakeSession } from "@/lib/intake/client"

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

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB — matches the UI promise

// Full template — every column the importer recognises, with example rows that
// show the accepted formats. Headers match the import column map (aliases like
// "Mobile No", "Full Name" also work). Only name + phone are required; the rest
// are optional and drive scoring:
//   • interest_level → High / Medium / Low  (adds an intent signal)
//   • last_contact_days → whole number of days since last contact (0 = today)
//   • budget → 25L, 1.2Cr, or a plain number like 500000
//   • notes → free text; keywords (demo, callback, site visit, "not interested")
//             nudge intent up or down
const SAMPLE_CSV =
  "name,phone,email,company,designation,city,state,pincode,budget,interest_level,last_contact_days,notes\n" +
  "Rohan Sharma,98765 43210,rohan@example.com,Acme Realty,Director,Bangalore,Karnataka,560066,25L,High,1,Wants a 3BHK in Whitefield — asked for a site visit\n" +
  "Priya Nair,+91 99887 76655,priya@example.com,Nair Exports,Owner,Mumbai,Maharashtra,400001,1.2Cr,Medium,3,Requested a callback next week\n" +
  "Imran Khan,9812345678,,,Manager,Lucknow,Uttar Pradesh,226001,500000,Low,10,Comparing vendors — no urgency yet\n"

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url
  a.download = "leadkaun-import-template.csv"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

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

        const circleCls =
          done   ? "bg-emerald-500 text-white" :
          active ? "bg-sky-500 text-white" :
                   "bg-slate-100 text-slate-400"

        return (
          <div key={step.stage} className="flex flex-col items-center relative">
            {/* connector line — to the right of every step except last */}
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={`absolute top-6 left-[60%] right-[-40%] h-[2px] ${cur > idx ? "bg-emerald-400" : "bg-slate-200"} transition-colors duration-500`} />
            )}
            <div className={`relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${circleCls} ${active ? "scale-105" : ""}`}>
              <Icon className="w-5 h-5" strokeWidth={2.4} />
              {active && (
                <span className="absolute inset-0 rounded-full ring-4 ring-sky-200/60 animate-pulse" />
              )}
            </div>
            <p className={`mt-2.5 text-[12px] font-semibold ${done ? "text-emerald-700" : active ? "text-sky-700" : "text-ink-muted"}`}>
              {step.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ── Upload form (batch-context fields for the idle panel) ────────────────────

function UploadForm({
  sources, stages, sourceId, stageId, sessionName, freshness,
  setSourceId, setStageId, setSessionName, setFreshness,
  uploading, metaError, onRetryMeta,
}: {
  sources: LeadSource[]; stages: PipelineStage[]
  sourceId: string; stageId: string; sessionName: string; freshness: string
  setSourceId: (v: string) => void; setStageId: (v: string) => void; setSessionName: (v: string) => void; setFreshness: (v: string) => void
  uploading: boolean
  metaError: boolean; onRetryMeta: () => void
}) {
  const inputCls = "w-full h-10 px-3 rounded-lg border border-hairline-strong bg-white text-[13px] text-ink outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-colors disabled:opacity-50"
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Batch Name</label>
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
          <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Lead Source</label>
          <ThemedSelect
            value={sourceId}
            onValueChange={setSourceId}
            options={sources.map((s) => ({ value: s.id, label: s.name }))}
            placeholder={metaError ? "Couldn't load" : sources.length ? "Select source" : "Loading…"}
            disabled={!sources.length || uploading}
            aria-label="Lead source"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Initial Stage</label>
          <ThemedSelect
            value={stageId}
            onValueChange={setStageId}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            placeholder={metaError ? "Couldn't load" : stages.length ? "Select stage" : "Loading…"}
            disabled={!stages.length || uploading}
            aria-label="Initial stage"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">How old is this list?</label>
          <ThemedSelect
            value={freshness}
            onValueChange={setFreshness}
            options={SOURCE_AGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            disabled={uploading}
            aria-label="Source data age"
          />
        </div>
      </div>

      {metaError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3.5 py-2.5">
          <p className="text-[12px] text-rose-600">Couldn&apos;t load sources or stages.</p>
          <button
            onClick={onRetryMeta}
            disabled={uploading}
            className="h-7 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold transition-colors active:scale-[0.97] disabled:opacity-50"
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
    <div className="rounded-xl border border-slate-200/70 bg-white p-5">
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
      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span className="truncate pr-2">{fileName || "Processing…"}</span>
        <span className="shrink-0">Hold tight — we finish in seconds.</span>
      </div>
    </div>
  )
}

// ── 5-tile Ingestion Summary ─────────────────────────────────────────────────

function SummaryTile({
  label, value, icon, tintBg, tintFg,
}: {
  label: string; value: React.ReactNode; icon: React.ReactNode; tintBg: string; tintFg: string
}) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 text-center">
      <div className={`w-10 h-10 rounded-lg mx-auto grid place-items-center mb-3 ${tintBg} ${tintFg}`}>
        {icon}
      </div>
      <p className="text-[11.5px] text-ink-muted font-medium">{label}</p>
      <p className="text-[24px] font-bold text-ink tabular-nums mt-1 leading-none">{value}</p>
    </div>
  )
}

function IngestionSummary({ job, isLoading }: { job: ImportJob | null; isLoading: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
      <h2 className="text-[15px] font-semibold text-ink mb-4">Ingestion summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryTile
          label="Total Rows"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.total_rows ?? 0).toLocaleString("en-IN")}
          icon={<Users className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-sky-50" tintFg="text-sky-600"
        />
        <SummaryTile
          label="New Leads"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.inserted ?? 0).toLocaleString("en-IN")}
          icon={<CheckCircle2 className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-emerald-50" tintFg="text-emerald-600"
        />
        <SummaryTile
          label="Duplicates Removed"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.duplicates ?? 0).toLocaleString("en-IN")}
          icon={<ShieldCheck className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-orange-50" tintFg="text-orange-600"
        />
        <SummaryTile
          label="Hot Leads (A/B)"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (job?.high_intent_count ?? 0).toLocaleString("en-IN")}
          icon={<Star className="w-5 h-5 fill-current" strokeWidth={2} />}
          tintBg="bg-violet-50" tintFg="text-violet-600"
        />
        <SummaryTile
          label="Pipeline Value"
          value={isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : `₹${formatINR(job?.total_value ?? 0)}`}
          icon={<IndianRupee className="w-5 h-5" strokeWidth={2} />}
          tintBg="bg-emerald-50" tintFg="text-emerald-600"
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

// ── Analysing panel (between upload and the report) ──────────────────────────

function AnalysingPanel({ fileName }: { fileName: string }) {
  const steps = [
    "Reading your columns",
    "Understanding your contacts",
    "Detecting the business type",
    "Measuring data quality",
    "Looking for duplicates",
    "Preparing your report",
  ]
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white px-6 py-14 max-w-3xl mx-auto text-center">
      <div className="w-14 h-14 rounded-2xl mx-auto grid place-items-center mb-5 bg-sky-50 text-sky-600">
        <Loader2 className="w-7 h-7 animate-spin" strokeWidth={2} />
      </div>
      <h2 className="text-[22px] font-semibold text-ink tracking-[-0.01em]">Analysing your leads…</h2>
      <p className="text-[13px] text-ink-muted mt-1">{fileName || "Understanding your data before importing"}</p>
      <ul className="mt-6 inline-flex flex-col gap-2 text-left">
        {steps.map((s) => (
          <li key={s} className="flex items-center gap-2.5 text-[13px] text-ink-soft">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> {s}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router            = useRouter()
  const queryClient       = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const isManager         = currentUser?.user.role === "ADMIN" || currentUser?.user.role === "MANAGER"

  // Form state
  const [sources,     setSources]     = useState<LeadSource[]>([])
  // Onboarding hands the user here rather than reimplementing import. When it
  // does, the completion CTA returns them to the ICP step instead of dropping
  // them at the queue mid-wizard.
  const [fromOnboarding, setFromOnboarding] = useState(false)
  useEffect(() => {
    try {
      setFromOnboarding(new URLSearchParams(window.location.search).get("from") === "onboarding")
    } catch {
      /* ignore */
    }
  }, [])

  const [stages,      setStages]      = useState<PipelineStage[]>([])
  const [sourceId,    setSourceId]    = useState<string>("")
  const [stageId,     setStageId]     = useState<string>("")
  const [sessionName, setSessionName] = useState<string>("")
  const [freshness,   setFreshness]   = useState<string>("unknown")

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState<number | null>(null)
  const [fileName,  setFileName]  = useState<string>("")
  const [result,    setResult]    = useState<{
    jobId: string; aborted: boolean
    inserted: number; duplicates: number; errors: number
    high_intent_count: number; total_value: number; total_rows: number | null
    errorDetail: ErrorDetail | null
  } | null>(null)

  // Intake: analyse → report → approve, before importing
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null)
  const [report,     setReport]     = useState<IntakeReportData | null>(null)
  const [sessionId,  setSessionId]  = useState<string | null>(null)
  const [analysing,  setAnalysing]  = useState(false)
  const [analysisSeconds, setAnalysisSeconds] = useState<number | undefined>(undefined)

  const fileRef     = useRef<HTMLInputElement>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Google Sheets + Manual Entry modals
  const [sheetsOpen, setSheetsOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [dragOver,   setDragOver]   = useState(false)

  // Invalidate every lead-derived cache so a new import/lead shows up app-wide
  // without a manual page refresh.
  const refreshLeadCaches = useCallback(() => {
    for (const key of [
      ["queue"], ["leads"], ["leads-stats"], ["leads-sample"],
      ["missed-opportunities"], ["missed-count"],
      ["pipeline"], ["pipeline-summary"],
      ["dashboard"], ["dashboard-pulse"],
      ["follow-ups"], ["follow-ups-engine"],
      ["analytics-intelligence"], ["rep-tracking"],
      ["notifications"], ["notif-count"],
    ]) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }, [queryClient])

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
    await processFile(file)
  }

  // Drag-and-drop onto the CSV dropzone — same pipeline as the file picker.
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    if (!sourceId || !stageId) {
      toast.error("Please select a lead source and initial stage first")
      return
    }
    const file = e.dataTransfer.files?.[0]
    if (file) void processFile(file)
  }

  async function processFile(file: File) {
    // import_started used to fire only from the onboarding button, so anyone
    // who reached this screen from the sidebar appeared in the funnel as an
    // import that completed without ever starting. trackFunnel dedupes to one
    // milestone per account, so firing it here as well is safe — it records
    // whichever route the customer actually took.
    if (!fromOnboarding) trackFunnel("import_started", { from: "leads-import" })

    // ── Guard the file before we touch it ────────────────────────────────────
    const isCsv = file.name.toLowerCase().endsWith(".csv") ||
      file.type === "text/csv" || file.type === "application/vnd.ms-excel"
    if (!isCsv) {
      toast.error("Please upload a .csv file. Export your sheet as CSV first (Excel/Google Sheets → File → Download → CSV).")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB. Split it into smaller files and import each.`)
      return
    }
    if (file.size === 0) {
      toast.error("That file is empty.")
      return
    }

    setFileName(file.name)
    setResult(null)
    setReport(null)
    setSessionId(null)
    const uploadStartedAt = new Date().toISOString()
    setAnalysing(true)

    try {
      // ── Parse client-side (encoding-aware) ───────────────────────────────
      const buf     = await file.arrayBuffer()
      const utf8    = new TextDecoder("utf-8").decode(buf)
      const csvText = utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8
      const parsed  = Papa.parse<Record<string, string>>(csvText, {
        header: true, skipEmptyLines: true, transformHeader: mapHeader,
      })
      const rows = parsed.data
      if (rows.length === 0) {
        toast.error("CSV file is empty or has no valid rows.")
        setAnalysing(false); return
      }
      setParsedRows(rows)

      // ── Analyse first — reveal understanding before importing (Law 46) ────
      const analyseT0 = typeof performance !== "undefined" ? performance.now() : Date.now()
      const aRes = await fetch("/api/import/analyse", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sample:            rows.slice(0, 2000),
          total_rows:        rows.length,
          upload_source:     "csv",
          upload_started_at: uploadStartedAt,
        }),
      })
      const aData = await aRes.json().catch(() => ({}))
      const analyseElapsed = ((typeof performance !== "undefined" ? performance.now() : Date.now()) - analyseT0) / 1000
      setAnalysing(false)
      if (aRes.ok && aData?.report) {
        // Funnel: the analysis landed and the report is about to be shown. These
        // are the two steps that were invisible before — onboarding used to skip
        // this screen entirely.
        trackFunnel("analysis_completed", { seconds: Math.round(analyseElapsed * 10) / 10 })
        trackFunnel("report_viewed")
        setReport(aData.report as IntakeReportData)
        setSessionId(typeof aData.session_id === "string" ? aData.session_id : null)
        setAnalysisSeconds(Math.round(analyseElapsed * 10) / 10)
      } else {
        // Analysis is a bonus, never a gate — fall back to a direct import.
        toast.message("Imported directly — analysis wasn't available for this file.")
        await runImport(rows, null, false)
      }
    } catch (err) {
      console.error("Analyse failed:", err)
      setAnalysing(false)
      toast.error("Couldn't read that file. Please try again.")
    }
  }

  // Run the actual chunked import (after the customer approves, or as a fallback).
  async function runImport(rows: Record<string, string>[], sid: string | null, approved = true) {
    // Only when the customer actually approved the report. runImport is also
    // the fallback when analysis fails, and firing "approved" there recorded a
    // decision nobody made.
    if (approved) trackFunnel("import_approved", { rows: rows.length })
    setReport(null)
    setUploading(true)
    setProgress(0)
    setResult(null)
    if (sid) patchIntakeSession(sid, "import_started")

    try {
      // ── Start the job ────────────────────────────────────────────────────
      const initRes = await fetch("/api/import/csv/init", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id:  sourceId,
          stage_id:   stageId,
          name:       sessionName.trim() || undefined,
          total_rows: rows.length,
          file_name:  fileName,
        }),
      })
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}))
        toast.error(err.error ?? "Could not start import. Check your CSV and try again.")
        setProgress(null); setUploading(false)
        if (sid) patchIntakeSession(sid, "failed")
        return
      }
      const { jobId } = await initRes.json()

      // ── Stream rows in small batches with real progress ──────────────────
      // Source-collection date for freshness (computed once for the whole import).
      const sourceCollectedAt = sourceAgeToDate(freshness)?.toISOString() ?? null
      const BATCH = 10
      let inserted = 0, duplicates = 0, errors = 0, highIntent = 0, totalValue = 0
      const errorReasons: string[] = []
      let aborted = false

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const bRes  = await fetch("/api/import/csv/batch", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId, source_id: sourceId, stage_id: stageId,
            rows: batch, startRowIndex: i + 2,   // +2: 1-based + header row
            source_collected_at: sourceCollectedAt,
          }),
        })
        if (!bRes.ok) { aborted = true; break }
        const r = await bRes.json()
        inserted   += r.inserted        ?? 0
        duplicates += r.duplicates      ?? 0
        errors     += r.errors          ?? 0
        highIntent += r.highIntentCount ?? 0
        totalValue += r.totalValue      ?? 0
        if (Array.isArray(r.errorReasons)) {
          for (const reason of r.errorReasons) if (errorReasons.length < 100) errorReasons.push(reason)
        }
        setProgress(Math.min(99, Math.round(((i + batch.length) / rows.length) * 100)))
      }

      // ── Finalise ──────────────────────────────────────────────────────────
      await fetch("/api/import/csv/complete", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, errorReasons, totalErrors: errors, aborted }),
      }).catch(() => {})

      setProgress(100)
      setResult({
        jobId, aborted,
        inserted, duplicates, errors,
        high_intent_count: highIntent,
        total_value:       totalValue,
        total_rows:        rows.length,
        errorDetail: errorReasons.length > 0
          ? { total_errors: errors, shown: errorReasons.length, truncated: errors > errorReasons.length, rows: errorReasons }
          : null,
      })

      if (sid) {
        if (aborted) patchIntakeSession(sid, "failed")
        else patchIntakeSession(sid, "import_completed", { import_job_id: jobId })
      }

      if (aborted) {
        toast.warning(`Import stopped early — ${inserted} added before an error. Please retry the remaining rows.`)
      } else if (inserted > 0) {
        toast.success(`Import complete — ${inserted} lead${inserted === 1 ? "" : "s"} added`)
      } else {
        toast.info(`Import complete — 0 new leads (${duplicates} duplicate${duplicates === 1 ? "" : "s"})`)
      }

      refreshLeadCaches()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      console.error("CSV import failed:", err)
      toast.error("Unexpected error during import. Please try again.")
      setProgress(null)
      if (sid) patchIntakeSession(sid, "failed")
    } finally {
      setUploading(false)
      setParsedRows(null)
    }
  }

  // Approve the report → import the leads we already parsed.
  function startImport() {
    if (!parsedRows) return
    if (sessionId) patchIntakeSession(sessionId, "approved")
    void runImport(parsedRows, sessionId)
  }

  // "Not now" — record why (lightly) and clear the review.
  function cancelReview(reason?: string) {
    if (sessionId) {
      if (reason) patchIntakeSession(sessionId, "cancelled", { reason })
      else patchIntakeSession(sessionId, "abandoned")
    }
    setReport(null); setParsedRows(null); setSessionId(null); setFileName("")
  }

  // ── Google Sheets: pull now, optionally keep in sync ───────────────────────
  async function handleSheetImport(sheetUrl: string, keepInSync: boolean) {
    if (!sourceId || !stageId) {
      toast.error("Please select a lead source and initial stage first")
      return
    }
    setSheetsOpen(false)
    setFileName("Google Sheet")
    setUploading(true)
    setProgress(20)          // one blocking request — show activity, then jump to 100
    setResult(null)
    try {
      const res = await fetch("/api/import/sheets", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet_url:           sheetUrl,
          source_id:           sourceId,
          stage_id:            stageId,
          name:                sessionName.trim() || undefined,
          source_collected_at: sourceAgeToDate(freshness)?.toISOString() ?? null,
          keep_in_sync:        keepInSync,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Google Sheets import failed.")
        setProgress(null); setUploading(false); return
      }
      setProgress(100)
      setResult({
        jobId: data.jobId, aborted: false,
        inserted: data.inserted ?? 0, duplicates: data.duplicates ?? 0, errors: data.errors ?? 0,
        high_intent_count: data.high_intent_count ?? 0, total_value: data.total_value ?? 0,
        total_rows: data.total_rows ?? null,
        errorDetail: data.errorDetail ?? null,
      })
      if ((data.inserted ?? 0) > 0) {
        toast.success(`Imported ${data.inserted} lead${data.inserted === 1 ? "" : "s"} from Google Sheets`)
      } else {
        toast.info(`Import complete — 0 new leads (${data.duplicates ?? 0} duplicate${data.duplicates === 1 ? "" : "s"})`)
      }
      if (data.truncated) {
        toast.info(`That sheet had ${data.sheet_total_rows?.toLocaleString("en-IN")} rows — imported the first ${data.total_rows?.toLocaleString("en-IN")}. Split the rest or export to CSV.`)
      }
      if (data.connected) {
        toast.success("Auto-sync is on — new rows will import every few minutes")
        queryClient.invalidateQueries({ queryKey: ["sheet-sync"] })
      }
      refreshLeadCaches()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      console.error("Sheets import failed:", err)
      toast.error("Unexpected error during Google Sheets import.")
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
        id: result.jobId, status: result.aborted ? "FAILED" : "COMPLETE", name: null, file_name: fileName,
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

      {report && !uploading && !result ? (
        <IntakeReport
          report={report}
          sessionId={sessionId}
          analysisSeconds={analysisSeconds}
          importing={uploading}
          onApprove={startImport}
          onCancel={cancelReview}
        />
      ) : analysing ? (
        <AnalysingPanel fileName={fileName} />
      ) : (
      <>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl grid place-items-center bg-sky-50 text-sky-600 shrink-0">
          <Download className="w-5 h-5" strokeWidth={2.2} />
        </span>
        <div>
          <h1 className="text-[24px] font-semibold text-ink tracking-[-0.02em] leading-tight">Lead Ingestion</h1>
          <p className="text-[13px] text-ink-muted mt-1 leading-relaxed max-w-[560px]">
            Import from CSV, Google Sheets, or add manually. Indian phone normalisation + dedup built in.
          </p>
        </div>
      </div>

      {/* ── Connected Google Sheet (if auto-sync is on) ──────────────────── */}
      <ConnectedSheetCard />

      {stage === "idle" ? (
        /* ── Guided import panel: batch details → upload → other methods ─── */
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6 space-y-6">

          {/* Step 1 — batch details */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[11px] font-bold grid place-items-center shrink-0">1</span>
              <h2 className="text-[15px] font-semibold text-ink">Set the batch details</h2>
            </div>
            <UploadForm
              sources={sources} stages={stages}
              sourceId={sourceId} stageId={stageId} sessionName={sessionName} freshness={freshness}
              setSourceId={setSourceId} setStageId={setStageId} setSessionName={setSessionName} setFreshness={setFreshness}
              uploading={uploading}
              metaError={metaError} onRetryMeta={loadMeta}
            />
          </div>

          {/* Step 2 — upload (drag & drop or browse) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[11px] font-bold grid place-items-center shrink-0">2</span>
              <h2 className="text-[15px] font-semibold text-ink">Upload your file</h2>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={handleCsvClick}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCsvClick() } }}
              onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              aria-disabled={uploading}
              className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60
                ${uploading ? "opacity-60 cursor-not-allowed border-slate-200"
                  : dragOver ? "border-sky-400 bg-sky-50/70 cursor-pointer"
                  : "border-slate-300 hover:border-sky-300 hover:bg-sky-50/30 cursor-pointer"}`}
            >
              <div className="w-14 h-14 rounded-2xl mx-auto grid place-items-center mb-3 bg-sky-50 text-sky-600">
                <CloudUpload className="w-7 h-7" strokeWidth={1.8} />
              </div>
              <p className="text-[14px] font-semibold text-ink">Drag &amp; drop your CSV here</p>
              <p className="text-[12.5px] text-ink-muted mt-1">
                or <span className="font-semibold text-sky-600">browse files</span> · CSV, max 10 MB
              </p>
              {(!sourceId || !stageId) && (
                <p className="text-[12px] font-medium text-amber-600 mt-3">Pick a source and stage above first.</p>
              )}
            </div>

            {/* helper + secondary methods */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-sky-700 hover:text-sky-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download sample template
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-muted">Other ways:</span>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setSheetsOpen(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-ink-soft hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600" /> Google Sheets
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setManualOpen(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-ink-soft hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5 text-violet-600" /> Add manually
                </button>
              </div>
            </div>

            {/* recognised columns */}
            <p className="mt-3 text-[11.5px] text-ink-muted leading-relaxed">
              <span className="font-semibold text-ink-soft">Required:</span> name, phone.{" "}
              <span className="font-semibold text-ink-soft">Optional:</span> email, company, designation, city, state, pincode,
              budget, interest level (High/Medium/Low), last contact days, notes.
              Column names are matched automatically — “Mobile No”, “Full Name”, etc. all work.
            </p>
          </div>
        </div>
      ) : (
        /* ── Processing / complete panel ─────────────────────────────────── */
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold text-ink mb-5">
            {stage === "complete" ? (result?.aborted ? "Import stopped early" : "Ingestion complete") : "Importing your leads…"}
          </h2>

          <PipelineSteps current={stage} />

          <div className="mt-6">
            {stage === "complete" && result ? (
              <div className="rounded-xl border border-slate-200/70 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className={`text-[14px] font-semibold ${result.aborted ? "text-amber-700" : "text-emerald-700"}`}>
                    {result.aborted ? "Stopped early" : "Done!"}
                  </p>
                  <span className={`text-[14px] font-bold tabular-nums ${result.aborted ? "text-amber-600" : "text-emerald-600"}`}>
                    {result.total_rows ? Math.round(((result.inserted + result.duplicates + result.errors) / result.total_rows) * 100) : 100}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: result.aborted && result.total_rows
                      ? `${Math.round(((result.inserted + result.duplicates + result.errors) / result.total_rows) * 100)}%`
                      : "100%",
                    background: result.aborted
                      ? "linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)"
                      : "linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)",
                  }} />
                </div>
                <p className="text-[11px] text-ink-muted mt-2 truncate">{fileName || "Your import"}</p>
              </div>
            ) : (
              <LiveProgress stage={stage} progress={progress} fileName={fileName} />
            )}
          </div>
        </div>
      )}

      {/* ── Ingestion Summary (5-tile) ───────────────────────────────────── */}
      {showSummary && <IngestionSummary job={summaryJob} isLoading={false} />}

      {/* ── Stopped-early callout (a batch failed mid-stream) ─────────────── */}
      {result?.aborted && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" strokeWidth={2.2} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink">Import stopped early</p>
            <p className="text-[12px] text-ink-soft mt-0.5">
              {result.inserted} lead{result.inserted === 1 ? "" : "s"} added before a connection error.
              Re-upload the same file to finish — already-added leads are skipped as duplicates, so nothing is double-imported.
            </p>
          </div>
          {result.inserted > 0 && (
            <Link
              href={`/leads?batch=${result.jobId}`}
              className="h-9 px-3.5 rounded-lg text-[12px] font-semibold text-amber-800 border border-amber-300 bg-white hover:bg-amber-100 transition-colors shrink-0 whitespace-nowrap"
            >
              View added
            </Link>
          )}
        </div>
      )}

      {/* ── Success callout (post-import) ─────────────────────────────────── */}
      {result && !result.aborted && result.inserted > 0 && (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full grid place-items-center shrink-0 bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-ink">Ingestion completed successfully!</p>
            <p className="text-[13px] text-ink-soft mt-0.5">Leads are now live in your Priority Queue.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/leads?batch=${result.jobId}`}
              className="h-10 px-4 rounded-lg text-[13px] font-semibold text-emerald-700 border border-emerald-200 bg-white hover:bg-emerald-50 transition-colors"
            >
              View this batch
            </Link>
            <button
              onClick={() => {
                if (fromOnboarding) {
                  router.push("/onboarding?step=icp&imported=1")
                } else {
                  // first_priority_viewed is emitted by /queue itself — the event
                  // should mean "reached the prioritisation experience", not
                  // "clicked a particular button".
                  router.push("/queue")
                }
              }}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[13px] font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors active:scale-[0.98]"
            >
              {fromOnboarding ? "Next: make it yours" : "Start executing"} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── No-new-leads callout (when result.inserted == 0) ──────────────── */}
      {result && !result.aborted && result.inserted === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" strokeWidth={2.2} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink">No new leads added</p>
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
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
        <h2 className="text-[15px] font-semibold text-ink mb-4">Import history</h2>
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
                  <th className="text-left  py-2 pr-4 text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Batch</th>
                  <th className="text-left  py-2 pr-4 text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Date</th>
                  <th className="text-left  py-2 pr-4 text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Status</th>
                  <th className="text-right py-2 pr-4 text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Added</th>
                  <th className="text-right py-2 pr-4 text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Hot</th>
                  <th className="text-right py-2 pr-4 text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Value</th>
                  <th className="text-right py-2     text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Dupes</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => <HistoryRow key={job.id} job={job} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>
      )}

      {/* ── Google Sheets modal ──────────────────────────────────────────── */}
      <SheetsModal
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        onImport={handleSheetImport}
        ready={Boolean(sourceId && stageId)}
      />

      {/* ── Manual entry modal ───────────────────────────────────────────── */}
      <ManualLeadModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        sources={sources}
        stages={stages}
        defaultSourceId={sourceId}
        defaultStageId={stageId}
        onCreated={() => { refreshLeadCaches(); setRefreshKey((k) => k + 1) }}
      />
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
    <div className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4 flex items-center justify-between gap-4">
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

// ── Connected Google Sheet (auto-sync status) ──────────────────────────────────

interface SheetSyncStatus {
  connected: boolean
  sync?: { id: string; sheet_url: string; last_synced_at: string | null; last_status: string | null; total_synced: number }
}

function ConnectedSheetCard() {
  const queryClient = useQueryClient()
  const [disconnecting, setDisconnecting] = useState(false)
  const { data } = useQuery<SheetSyncStatus>({
    queryKey: ["sheet-sync"],
    queryFn: async () => {
      const res = await fetch("/api/import/sheets", { credentials: "include" })
      if (!res.ok) return { connected: false }
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  if (!data?.connected || !data.sync) return null
  const s = data.sync
  const ok = (s.last_status ?? "ok") === "ok"

  async function disconnect() {
    setDisconnecting(true)
    try {
      const res = await fetch("/api/import/sheets", { method: "DELETE", credentials: "include" })
      if (!res.ok) { toast.error("Couldn't disconnect. Try again."); setDisconnecting(false); return }
      toast.success("Auto-sync disconnected")
      queryClient.invalidateQueries({ queryKey: ["sheet-sync"] })
    } catch {
      toast.error("Couldn't disconnect. Try again."); setDisconnecting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0 bg-sky-50 text-sky-600">
        <FileSpreadsheet className="w-5 h-5" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-ink">Google Sheet connected</p>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ok ? "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200" : "text-amber-700 bg-amber-50 ring-1 ring-amber-200"}`}>
            {ok ? <><CheckCircle2 className="w-3 h-3" /> Syncing</> : <><AlertCircle className="w-3 h-3" /> Attention</>}
          </span>
        </div>
        <p className="text-[12px] text-ink-muted mt-0.5 truncate">
          {s.total_synced.toLocaleString("en-IN")} auto-synced ·{" "}
          {s.last_synced_at
            ? `last checked ${new Date(s.last_synced_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : "not yet checked"}
          {!ok && s.last_status ? ` · ${s.last_status}` : ""}
        </p>
      </div>
      <button
        onClick={disconnect}
        disabled={disconnecting}
        className="h-9 px-3.5 rounded-lg text-[12px] font-semibold text-ink-soft border border-slate-200 bg-white hover:bg-slate-50 transition-colors shrink-0 disabled:opacity-50"
      >
        {disconnecting ? "…" : "Disconnect"}
      </button>
    </div>
  )
}

// ── Shared modal shell ─────────────────────────────────────────────────────────

function ModalShell({
  title, subtitle, icon, accentBg, onClose, children,
}: {
  title: string; subtitle?: string; icon: React.ReactNode; accentBg: string
  onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="mt-[5vh] w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200/70" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100">
          <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${accentBg}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-semibold text-ink leading-tight">{title}</h3>
            {subtitle && <p className="text-[12px] text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink shrink-0 -mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ── Google Sheets modal ────────────────────────────────────────────────────────

function SheetsModal({
  open, onClose, onImport, ready,
}: {
  open: boolean; onClose: () => void; onImport: (url: string, keepInSync: boolean) => void; ready: boolean
}) {
  const [url, setUrl] = useState("")
  const [keepInSync, setKeepInSync] = useState(false)
  if (!open) return null
  const valid = /docs\.google\.com\/spreadsheets\/d\//.test(url)
  return (
    <ModalShell
      title="Import from Google Sheets"
      subtitle="Paste a shared sheet link — we pull it once through the same scoring pipeline."
      icon={<FileSpreadsheet className="w-5 h-5 text-sky-600" strokeWidth={2} />}
      accentBg="bg-sky-50"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Google Sheet link</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            autoFocus
            className="w-full h-10 px-3 rounded-lg border border-hairline-strong bg-white text-[13px] text-ink outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 placeholder:text-ink-faint"
          />
        </div>

        <div className="rounded-lg bg-sky-50/60 border border-sky-100 p-3 text-[12px] text-ink-soft leading-relaxed">
          <p className="font-semibold text-ink mb-1">Before you import</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>In the sheet: <span className="font-medium text-ink">Share → General access → “Anyone with the link (Viewer)”</span>.</li>
            <li>First row must be the header (name, phone, email, …).</li>
            <li>We import the first tab, using the source, stage &amp; list-age selected on this page.</li>
          </ol>
        </div>

        {!ready && (
          <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Pick a lead source and initial stage on the import page first.
          </p>
        )}

        <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={keepInSync}
            onChange={(e) => setKeepInSync(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-hairline-strong text-sky-500 focus:ring-sky-300"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-ink">Keep this sheet in sync</span>
            <span className="block text-[11px] text-ink-muted mt-0.5">We re-check every few minutes and auto-import new rows. Duplicates are skipped. You can disconnect anytime.</span>
          </span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-[13px] font-semibold text-ink-soft hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || !ready}
            onClick={() => onImport(url.trim(), keepInSync)}
            className="h-10 px-4 rounded-lg text-[13px] font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors active:scale-[0.98]"
          >
            <FileSpreadsheet className="w-4 h-4" /> {keepInSync ? "Import & sync" : "Import sheet"}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Manual entry modal ─────────────────────────────────────────────────────────

/** Parse a budget string like "25L", "1.2Cr", "₹5,00,000" → integer rupees. */
function parseBudget(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[₹,\s]/g, "")
  if (!s) return null
  const m = s.match(/^([\d.]+)(cr|crore|l|lac|lakh|k)?$/)
  if (!m) return null
  const num = parseFloat(m[1])
  if (isNaN(num)) return null
  const unit = m[2]
  let val = num
  if (unit === "cr" || unit === "crore") val = num * 1_00_00_000
  else if (unit === "l" || unit === "lac" || unit === "lakh") val = num * 1_00_000
  else if (unit === "k") val = num * 1_000
  const int = Math.round(val)
  return int > 0 ? int : null
}

function ManualField({
  label, value, onChange, placeholder, type = "text", required, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; required?: boolean; autoFocus?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full h-10 px-3 rounded-lg border border-hairline-strong bg-white text-[13px] text-ink outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-ink-faint"
      />
    </div>
  )
}

const EMPTY_MANUAL = {
  first_name: "", last_name: "", phone: "", email: "", company_name: "",
  designation: "", city: "", state: "", pincode: "", expected_value: "",
  interest_level: "", last_contact_days: "", inquiry_text: "",
}

function ManualLeadModal({
  open, onClose, sources, stages, defaultSourceId, defaultStageId, onCreated,
}: {
  open: boolean; onClose: () => void
  sources: LeadSource[]; stages: PipelineStage[]
  defaultSourceId: string; defaultStageId: string
  onCreated: () => void
}) {
  const [f, setF] = useState({ ...EMPTY_MANUAL })
  const [sourceId, setSourceId] = useState(defaultSourceId)
  const [stageId, setStageId] = useState(defaultStageId)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) { setSourceId(defaultSourceId); setStageId(defaultStageId) }
  }, [open, defaultSourceId, defaultStageId])

  if (!open) return null

  const set = (k: keyof typeof EMPTY_MANUAL) => (v: string) => setF((prev) => ({ ...prev, [k]: v }))
  const phoneDigits = f.phone.replace(/\D/g, "").length
  const canSubmit = f.first_name.trim().length > 0 && phoneDigits >= 10 && Boolean(sourceId) && Boolean(stageId) && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)

    const days = f.last_contact_days.trim() === "" ? null : parseInt(f.last_contact_days, 10)
    const expected = parseBudget(f.expected_value)

    const payload: Record<string, unknown> = {
      first_name:   f.first_name.trim(),
      last_name:    f.last_name.trim() || undefined,
      phone:        f.phone.trim(),
      email:        f.email.trim() || undefined,
      company_name: f.company_name.trim() || undefined,
      designation:  f.designation.trim() || undefined,
      city:         f.city.trim() || undefined,
      state:        f.state.trim() || undefined,
      pincode:      f.pincode.trim() || undefined,
      source_id:    sourceId,
      stage_id:     stageId,
      inquiry_text: f.inquiry_text.trim() || undefined,
      expected_value:    expected ?? undefined,
      interest_level:    f.interest_level || undefined,
      last_contact_days: days !== null && !isNaN(days) && days >= 0 ? days : undefined,
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't add the lead. Check the fields and try again.")
        setSubmitting(false)
        return
      }
      const grade = typeof data.grade === "string" ? data.grade : undefined
      toast.success(`Lead added${grade ? ` — graded ${grade}` : ""}`)
      onCreated()
      setF({ ...EMPTY_MANUAL })
      onClose()
    } catch {
      toast.error("Unexpected error adding the lead.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Add a lead"
      subtitle="Scored on the same A–F engine as an import — intent included."
      icon={<UserPlus className="w-5 h-5 text-violet-600" strokeWidth={2} />}
      accentBg="bg-violet-50"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <ManualField label="First name" value={f.first_name} onChange={set("first_name")} placeholder="Rohan" required autoFocus />
          <ManualField label="Last name" value={f.last_name} onChange={set("last_name")} placeholder="Sharma" />
          <ManualField label="Phone" value={f.phone} onChange={set("phone")} placeholder="98765 43210" type="tel" required />
          <ManualField label="Email" value={f.email} onChange={set("email")} placeholder="rohan@example.com" type="email" />
          <ManualField label="Company" value={f.company_name} onChange={set("company_name")} placeholder="Acme Realty" />
          <ManualField label="Designation" value={f.designation} onChange={set("designation")} placeholder="Director" />
          <ManualField label="City" value={f.city} onChange={set("city")} placeholder="Bangalore" />
          <ManualField label="State" value={f.state} onChange={set("state")} placeholder="Karnataka" />
          <ManualField label="Pincode" value={f.pincode} onChange={set("pincode")} placeholder="560066" />
          <ManualField label="Budget" value={f.expected_value} onChange={set("expected_value")} placeholder="25L · 1.2Cr · 500000" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Lead source <span className="text-rose-500">*</span></label>
            <ThemedSelect value={sourceId} onValueChange={setSourceId} options={sources.map((s) => ({ value: s.id, label: s.name }))} placeholder={sources.length ? "Select source" : "Loading…"} disabled={!sources.length} aria-label="Lead source" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Initial stage <span className="text-rose-500">*</span></label>
            <ThemedSelect value={stageId} onValueChange={setStageId} options={stages.map((s) => ({ value: s.id, label: s.name }))} placeholder={stages.length ? "Select stage" : "Loading…"} disabled={!stages.length} aria-label="Initial stage" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Interest level</label>
            <ThemedSelect value={f.interest_level} onValueChange={set("interest_level")} options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} placeholder="Not set" aria-label="Interest level" />
          </div>
          <ManualField label="Days since last contact" value={f.last_contact_days} onChange={set("last_contact_days")} placeholder="e.g. 2" type="number" />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-soft uppercase tracking-[0.08em] block">Notes</label>
          <textarea
            value={f.inquiry_text}
            onChange={(e) => set("inquiry_text")(e.target.value)}
            placeholder="What do they want? Keywords like “demo”, “site visit”, “callback” nudge intent up."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-hairline-strong bg-white text-[13px] text-ink outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-ink-faint resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-[13px] font-semibold text-ink-soft hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="h-10 px-4 rounded-lg text-[13px] font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors active:scale-[0.98]"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? "Adding…" : "Add lead"}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
