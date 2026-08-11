// ─────────────────────────────────────────────
// INTAKE CENTER — cross-account reads (Mission Control)
//
// Surfaces the intake_sessions state machine that every dataset entering
// Leadkaun passes through. Three jobs:
//   1. Support  — reconstruct exactly what one customer saw and when.
//   2. Ops      — find sessions that failed, stalled, or were abandoned.
//   3. Research — Time-to-Trust, approval rate, what datasets are missing.
//
// Nothing here reads customer rows: intake_sessions stores only structural
// metadata plus the frozen report, by design.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { startOfIstDay } from "@/lib/time/ist"
import type { IntakeReport } from "@/lib/intake/types"
import { IntakeState, IntakeSource, IntakeAbandonReason, type Prisma } from "@prisma/client"

/** States at or past the customer approving the import. */
export const APPROVED_STATES: IntakeState[] = [IntakeState.APPROVED, IntakeState.IMPORTING, IntakeState.COMPLETED]
/** States that ended without an import. */
export const DROPPED_STATES: IntakeState[] = [IntakeState.ABANDONED, IntakeState.CANCELLED]

export const STATE_LABELS: Record<IntakeState, string> = {
  CREATED:      "Created",
  ANALYSING:    "Analysing",
  REPORT_READY: "Report ready",
  VIEWED:       "Viewed",
  APPROVED:     "Approved",
  IMPORTING:    "Importing",
  COMPLETED:    "Completed",
  ABANDONED:    "Abandoned",
  CANCELLED:    "Cancelled",
  FAILED:       "Failed",
}

export const ABANDON_LABELS: Record<IntakeAbandonReason, string> = {
  TOO_MANY_DUPLICATES: "Too many duplicates",
  NEED_TO_CLEAN_CSV:   "Need to clean the CSV",
  WRONG_MAPPING:       "Wrong mapping",
  OTHER:               "Other",
}

/** How far through the machine a state is, for ordering + progress rendering. */
export const STATE_ORDER: IntakeState[] = [
  IntakeState.CREATED, IntakeState.ANALYSING, IntakeState.REPORT_READY, IntakeState.VIEWED,
  IntakeState.APPROVED, IntakeState.IMPORTING, IntakeState.COMPLETED,
]

export function isTerminal(state: IntakeState): boolean {
  return state === IntakeState.COMPLETED || DROPPED_STATES.includes(state) || state === IntakeState.FAILED
}

// ── helpers ───────────────────────────────────────────────────────────────────

function ms(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  const d = b.getTime() - a.getTime()
  return d >= 0 ? d : null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null
}

/** The report column is Json; it was written from IntakeReport and is read back as one. */
function asReport(v: Prisma.JsonValue | null): IntakeReport | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as IntakeReport) : null
}

// ── Overview summary ──────────────────────────────────────────────────────────

export type IntakeSummary = {
  sessionsToday: number
  sessionsWindow: number
  approvalRatePct: number | null   // approved / report-viewed
  medianTttMs: number | null       // upload → approved
  medianAnalysisMs: number | null
  topMissingField: { field: string; pct: number } | null
  topAbandonReason: { label: string; count: number } | null
  failedWindow: number
  /** Sessions left mid-machine and untouched for >2h — someone should look. */
  stalled: number
  windowDays: number
}

export async function getIntakeSummary(windowDays = 30): Promise<IntakeSummary> {
  const start = new Date(Date.now() - windowDays * 86_400_000)
  const stallCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const inWindow = { created_at: { gte: start } }

  const [today, total, viewed, approved, failed, stalled, timings, abandon] = await Promise.all([
    prisma.intakeSession.count({ where: { created_at: { gte: startOfIstDay() } } }),
    prisma.intakeSession.count({ where: inWindow }),
    prisma.intakeSession.count({ where: { ...inWindow, report_viewed_at: { not: null } } }),
    prisma.intakeSession.count({ where: { ...inWindow, approved_at: { not: null } } }),
    prisma.intakeSession.count({ where: { ...inWindow, state: IntakeState.FAILED } }),
    prisma.intakeSession.count({
      where: {
        state: { in: [IntakeState.CREATED, IntakeState.ANALYSING, IntakeState.IMPORTING] },
        updated_at: { lt: stallCutoff },
      },
    }),
    prisma.intakeSession.findMany({
      where: inWindow,
      select: { upload_started_at: true, approved_at: true, analysis_duration_ms: true },
    }),
    prisma.intakeSession.groupBy({
      by: ["abandon_reason"],
      where: { ...inWindow, abandon_reason: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { abandon_reason: "desc" } },
      take: 1,
    }),
  ])

  const ttts = timings
    .map((s) => ms(s.upload_started_at, s.approved_at))
    .filter((v): v is number => v != null)
  const analysis = timings
    .map((s) => s.analysis_duration_ms)
    .filter((v): v is number => v != null)

  return {
    sessionsToday: today,
    sessionsWindow: total,
    approvalRatePct: pct(approved, viewed),
    medianTttMs: median(ttts),
    medianAnalysisMs: median(analysis),
    topMissingField: await topMissingField(start),
    topAbandonReason: abandon[0]?.abandon_reason
      ? { label: ABANDON_LABELS[abandon[0].abandon_reason], count: abandon[0]._count._all }
      : null,
    failedWindow: failed,
    stalled,
    windowDays: windowDays,
  }
}

/** How many analytics sessions we read report JSON for. Surfaced in the UI. */
export const REPORT_SCAN_CAP = 1000

async function topMissingField(start: Date): Promise<{ field: string; pct: number } | null> {
  const rows = await prisma.intakeSession.findMany({
    where: { created_at: { gte: start } },
    select: { report: true },
    orderBy: { created_at: "desc" },
    take: REPORT_SCAN_CAP,
  })
  const tally = tallyMissingFields(rows.map((r) => asReport(r.report)))
  return tally[0] ? { field: tally[0].field, pct: tally[0].pct } : null
}

export function tallyMissingFields(reports: (IntakeReport | null)[]): { field: string; count: number; pct: number }[] {
  const counts = new Map<string, number>()
  let n = 0
  for (const r of reports) {
    if (!r) continue
    n++
    for (const f of r.missingFields ?? []) counts.set(f, (counts.get(f) ?? 0) + 1)
  }
  if (n === 0) return []
  return Array.from(counts.entries())
    .map(([field, count]) => ({ field, count, pct: Math.round((count / n) * 100) }))
    .sort((a, b) => b.count - a.count)
}

// ── Sessions list ─────────────────────────────────────────────────────────────

export type IntakeSessionRow = {
  id: string
  accountId: string
  accountName: string
  workspaceName: string | null
  userName: string | null
  source: IntakeSource
  rows: number
  columns: number
  state: IntakeState
  score: number | null       // import intelligence score (internal)
  tttMs: number | null       // upload → approved
  abandonReason: IntakeAbandonReason | null
  engineVersion: string
  createdAt: Date
}

export type IntakeFilters = {
  source?: IntakeSource
  state?: IntakeState
  accountId?: string
  /** Only sessions whose internal intelligence score is below 60. */
  lowConfidence?: boolean
  /** Only sessions that ended without importing. */
  dropped?: boolean
  days?: number
  take?: number
}

export async function listIntakeSessions(f: IntakeFilters = {}): Promise<IntakeSessionRow[]> {
  const where: Prisma.IntakeSessionWhereInput = {}
  if (f.source) where.upload_source = f.source
  if (f.state) where.state = f.state
  if (f.accountId) where.account_id = f.accountId
  if (f.lowConfidence) where.import_intelligence_score = { lt: 60 }
  if (f.dropped) where.state = { in: DROPPED_STATES }
  if (f.days) where.created_at = { gte: new Date(Date.now() - f.days * 86_400_000) }

  const sessions = await prisma.intakeSession.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: Math.min(500, f.take ?? 200),
    select: {
      id: true, account_id: true, workspace_id: true, user_id: true, upload_source: true,
      rows: true, columns: true, state: true, import_intelligence_score: true,
      upload_started_at: true, approved_at: true, abandon_reason: true, engine_version: true, created_at: true,
    },
  })
  if (sessions.length === 0) return []

  // intake_sessions holds plain string refs (no relations) — resolve names in
  // one batch each rather than N+1.
  const [accounts, workspaces, users] = await Promise.all([
    prisma.account.findMany({
      where: { id: { in: Array.from(new Set(sessions.map((s) => s.account_id))) } },
      select: { id: true, name: true },
    }),
    prisma.workspace.findMany({
      where: { id: { in: Array.from(new Set(sessions.map((s) => s.workspace_id).filter((v): v is string => !!v))) } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: Array.from(new Set(sessions.map((s) => s.user_id).filter((v): v is string => !!v))) } },
      select: { id: true, first_name: true, last_name: true, email: true },
    }),
  ])
  const aName = new Map(accounts.map((a) => [a.id, a.name]))
  const wName = new Map(workspaces.map((w) => [w.id, w.name]))
  const uName = new Map(users.map((u) => [u.id, `${u.first_name} ${u.last_name ?? ""}`.trim() || u.email]))

  return sessions.map((s) => ({
    id: s.id,
    accountId: s.account_id,
    accountName: aName.get(s.account_id) ?? "(deleted account)",
    workspaceName: s.workspace_id ? wName.get(s.workspace_id) ?? null : null,
    userName: s.user_id ? uName.get(s.user_id) ?? null : null,
    source: s.upload_source,
    rows: s.rows,
    columns: s.columns,
    state: s.state,
    score: s.import_intelligence_score,
    tttMs: ms(s.upload_started_at, s.approved_at),
    abandonReason: s.abandon_reason,
    engineVersion: s.engine_version,
    createdAt: s.created_at,
  }))
}

// ── Session detail ────────────────────────────────────────────────────────────

export type IntakeSessionDetail = {
  id: string
  account: { id: string; name: string } | null
  workspaceName: string | null
  user: { name: string; email: string } | null
  source: IntakeSource
  state: IntakeState
  abandonReason: IntakeAbandonReason | null
  dataset: {
    rows: number
    columns: number
    sampleHash: string | null
    country: string | null
    currency: string | null
    businessType: string | null
    mappingVersion: string
    analysisVersion: string
    engineVersion: string
  }
  scores: {
    importIntelligenceScore: number | null
    mappingConfidence: number | null
    contactQuality: number | null
    businessContext: number | null
    completeness: number | null
  }
  clock: {
    uploadStartedAt: Date
    analysisFinishedAt: Date | null
    reportViewedAt: Date | null
    approvedAt: Date | null
    importStartedAt: Date | null
    importCompletedAt: Date | null
    analysisDurationMs: number | null
    /** Derived stage durations, null when a stage was never reached. */
    uploadToAnalysisMs: number | null
    analysisToViewMs: number | null
    viewToApprovalMs: number | null
    totalTttMs: number | null
    approvalToImportDoneMs: number | null
  }
  events: { id: string; state: IntakeState; note: string | null; at: Date }[]
  report: IntakeReport | null
  /** The import job created after approval, if any. */
  importJob: {
    id: string
    status: string
    totalRows: number
    inserted: number
    duplicates: number
    errors: number
    fileName: string | null
    completedAt: Date | null
  } | null
  /** Other sessions from the same account with the same column signature. */
  siblingCount: number
}

export async function getIntakeSessionDetail(id: string): Promise<IntakeSessionDetail | null> {
  const s = await prisma.intakeSession.findUnique({
    where: { id },
    include: { events: { orderBy: { at: "asc" } } },
  })
  if (!s) return null

  const [account, workspace, user, importJob, siblingCount] = await Promise.all([
    prisma.account.findUnique({ where: { id: s.account_id }, select: { id: true, name: true } }),
    s.workspace_id
      ? prisma.workspace.findUnique({ where: { id: s.workspace_id }, select: { name: true } })
      : Promise.resolve(null),
    s.user_id
      ? prisma.user.findUnique({
          where: { id: s.user_id },
          select: { first_name: true, last_name: true, email: true },
        })
      : Promise.resolve(null),
    s.import_job_id
      ? prisma.importJobStatus.findUnique({
          where: { id: s.import_job_id },
          select: {
            id: true, status: true, total_rows: true, inserted: true,
            duplicates: true, errors: true, file_name: true, completed_at: true,
          },
        })
      : Promise.resolve(null),
    s.sample_hash
      ? prisma.intakeSession.count({
          where: { account_id: s.account_id, sample_hash: s.sample_hash, id: { not: s.id } },
        })
      : Promise.resolve(0),
  ])

  return {
    id: s.id,
    account,
    workspaceName: workspace?.name ?? null,
    user: user ? { name: `${user.first_name} ${user.last_name ?? ""}`.trim(), email: user.email } : null,
    source: s.upload_source,
    state: s.state,
    abandonReason: s.abandon_reason,
    dataset: {
      rows: s.rows,
      columns: s.columns,
      sampleHash: s.sample_hash,
      country: s.detected_country,
      currency: s.detected_currency,
      businessType: s.detected_business_type,
      mappingVersion: s.mapping_version,
      analysisVersion: s.analysis_version,
      engineVersion: s.engine_version,
    },
    scores: {
      importIntelligenceScore: s.import_intelligence_score,
      mappingConfidence: s.mapping_confidence,
      contactQuality: s.contact_quality,
      businessContext: s.business_context,
      completeness: s.completeness,
    },
    clock: {
      uploadStartedAt: s.upload_started_at,
      analysisFinishedAt: s.analysis_finished_at,
      reportViewedAt: s.report_viewed_at,
      approvedAt: s.approved_at,
      importStartedAt: s.import_started_at,
      importCompletedAt: s.import_completed_at,
      analysisDurationMs: s.analysis_duration_ms,
      uploadToAnalysisMs: ms(s.upload_started_at, s.analysis_finished_at),
      analysisToViewMs: ms(s.analysis_finished_at, s.report_viewed_at),
      viewToApprovalMs: ms(s.report_viewed_at, s.approved_at),
      totalTttMs: ms(s.upload_started_at, s.approved_at),
      approvalToImportDoneMs: ms(s.approved_at, s.import_completed_at),
    },
    events: s.events.map((e) => ({ id: e.id, state: e.state, note: e.note, at: e.at })),
    report: asReport(s.report),
    importJob: importJob
      ? {
          id: importJob.id,
          status: importJob.status,
          totalRows: importJob.total_rows,
          inserted: importJob.inserted,
          duplicates: importJob.duplicates,
          errors: importJob.errors,
          fileName: importJob.file_name,
          completedAt: importJob.completed_at,
        }
      : null,
    siblingCount,
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export type Distribution = { key: string; label: string; count: number; pct: number }

export type IntakeAnalytics = {
  windowDays: number
  totals: { sessions: number; viewed: number; approved: number; completed: number; dropped: number; failed: number }
  approvalRatePct: number | null
  viewRatePct: number | null
  completionRatePct: number | null
  ttt: {
    uploadToAnalysis: number | null
    analysisToView: number | null
    viewToApproval: number | null
    total: number | null
    /** How many sessions each median was computed over. */
    n: { uploadToAnalysis: number; analysisToView: number; viewToApproval: number; total: number }
  }
  missingFields: { field: string; count: number; pct: number }[]
  businessTypes: Distribution[]
  sources: Distribution[]
  states: Distribution[]
  abandonReasons: Distribution[]
  readiness: Distribution[]
  engineVersions: Distribution[]
  /** Mean duplicate estimate the engine reported, across scanned reports. */
  avgDuplicatePct: number | null
  scanned: number
  scanCapped: boolean
}

function dist(rows: { key: string; label: string; count: number }[], total: number): Distribution[] {
  return rows
    .map((r) => ({ ...r, pct: total > 0 ? Math.round((r.count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
}

export async function getIntakeAnalytics(windowDays = 30): Promise<IntakeAnalytics> {
  const start = new Date(Date.now() - windowDays * 86_400_000)
  const where = { created_at: { gte: start } }

  const [sessions, bySource, byState, byBusinessType, byAbandon, byEngine, reportRows] = await Promise.all([
    prisma.intakeSession.findMany({
      where,
      select: {
        upload_started_at: true, analysis_finished_at: true, report_viewed_at: true,
        approved_at: true, state: true,
      },
    }),
    prisma.intakeSession.groupBy({ by: ["upload_source"], where, _count: { _all: true } }),
    prisma.intakeSession.groupBy({ by: ["state"], where, _count: { _all: true } }),
    prisma.intakeSession.groupBy({ by: ["detected_business_type"], where, _count: { _all: true } }),
    prisma.intakeSession.groupBy({
      by: ["abandon_reason"], where: { ...where, abandon_reason: { not: null } }, _count: { _all: true },
    }),
    prisma.intakeSession.groupBy({ by: ["engine_version"], where, _count: { _all: true } }),
    prisma.intakeSession.findMany({
      where, select: { report: true }, orderBy: { created_at: "desc" }, take: REPORT_SCAN_CAP,
    }),
  ])

  const total = sessions.length
  const viewed = sessions.filter((s) => s.report_viewed_at != null).length
  const approved = sessions.filter((s) => s.approved_at != null).length
  const completed = sessions.filter((s) => s.state === IntakeState.COMPLETED).length
  const dropped = sessions.filter((s) => DROPPED_STATES.includes(s.state)).length
  const failed = sessions.filter((s) => s.state === IntakeState.FAILED).length

  const g1 = sessions.map((s) => ms(s.upload_started_at, s.analysis_finished_at)).filter((v): v is number => v != null)
  const g2 = sessions.map((s) => ms(s.analysis_finished_at, s.report_viewed_at)).filter((v): v is number => v != null)
  const g3 = sessions.map((s) => ms(s.report_viewed_at, s.approved_at)).filter((v): v is number => v != null)
  const g4 = sessions.map((s) => ms(s.upload_started_at, s.approved_at)).filter((v): v is number => v != null)

  const reports = reportRows.map((r) => asReport(r.report))
  const readinessCounts = new Map<string, number>()
  const dupPcts: number[] = []
  for (const r of reports) {
    if (!r) continue
    const label = r.readiness?.label
    if (label) readinessCounts.set(label, (readinessCounts.get(label) ?? 0) + 1)
    if (typeof r.duplicateEstimate?.pct === "number") dupPcts.push(r.duplicateEstimate.pct)
  }

  return {
    windowDays,
    totals: { sessions: total, viewed, approved, completed, dropped, failed },
    approvalRatePct: pct(approved, viewed),
    viewRatePct: pct(viewed, total),
    completionRatePct: pct(completed, approved),
    ttt: {
      uploadToAnalysis: median(g1),
      analysisToView: median(g2),
      viewToApproval: median(g3),
      total: median(g4),
      n: { uploadToAnalysis: g1.length, analysisToView: g2.length, viewToApproval: g3.length, total: g4.length },
    },
    missingFields: tallyMissingFields(reports),
    businessTypes: dist(
      byBusinessType.map((r) => ({
        key: r.detected_business_type ?? "unknown",
        label: r.detected_business_type ?? "Not determined",
        count: r._count._all,
      })),
      total,
    ),
    sources: dist(
      bySource.map((r) => ({ key: r.upload_source, label: r.upload_source.replace(/_/g, " "), count: r._count._all })),
      total,
    ),
    states: dist(
      byState.map((r) => ({ key: r.state, label: STATE_LABELS[r.state], count: r._count._all })),
      total,
    ),
    abandonReasons: dist(
      byAbandon
        .filter((r) => r.abandon_reason != null)
        .map((r) => ({
          key: r.abandon_reason as string,
          label: ABANDON_LABELS[r.abandon_reason as IntakeAbandonReason],
          count: r._count._all,
        })),
      dropped,
    ),
    readiness: dist(
      Array.from(readinessCounts.entries()).map(([label, count]) => ({ key: label, label, count })),
      reports.filter(Boolean).length,
    ),
    engineVersions: dist(
      byEngine.map((r) => ({ key: r.engine_version, label: r.engine_version, count: r._count._all })),
      total,
    ),
    avgDuplicatePct: dupPcts.length
      ? Math.round((dupPcts.reduce((a, b) => a + b, 0) / dupPcts.length) * 10) / 10
      : null,
    scanned: reports.filter(Boolean).length,
    scanCapped: reportRows.length >= REPORT_SCAN_CAP,
  }
}
