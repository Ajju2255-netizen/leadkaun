// ─────────────────────────────────────────────
// OPERATIONS — jobs, errors, integrations (Mission Control)
//
// The boring section that saves you at 2am. Three questions:
//   Jobs         — is every scheduled function still firing, on its own cadence?
//   Errors       — separate EXPECTED validation skips from ACTUAL system failures.
//   Integrations — is each external dependency connected and moving data?
//
// Staleness is judged per function against its real schedule. A flat threshold
// says sheets-sync (every 5 min) is fine 40 hours after its last run, and says
// icp-regrade (event-driven, fires only when a customer edits their ICP) is
// broken when nothing happened. Both are wrong.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { startOfIstDay } from "@/lib/time/ist"
import { slackConfigured, getAdminRecipients } from "@/lib/admin/notify"
import { ImportStatus, type Prisma } from "@prisma/client"

// ── Jobs ──────────────────────────────────────────────────────────────────────

export type JobSpec = {
  name: string
  label: string
  /** Human cadence. */
  schedule: string
  /** Expected max gap between runs, ms. null = event-driven (never stale). */
  expectedGapMs: number | null
  note?: string
}

const MIN = 60_000
const HOUR = 60 * MIN

/** Source of truth: inngest/functions/*.ts. Crons are UTC; IST = UTC+5:30. */
export const JOB_SPECS: JobSpec[] = [
  { name: "sheets-sync",          label: "Google Sheets sync",   schedule: "every 5 min",          expectedGapMs: 30 * MIN },
  { name: "signup-alert",         label: "New signup alert",     schedule: "every 15 min",         expectedGapMs: 90 * MIN, note: "emails platform admins" },
  { name: "follow-up-overdue",    label: "Follow-up overdue",    schedule: "every 30 min",         expectedGapMs: 3 * HOUR },
  { name: "missed-opportunity",   label: "Missed opportunity",   schedule: "hourly",               expectedGapMs: 4 * HOUR },
  { name: "intent-decay",         label: "Nightly intent decay", schedule: "02:00 IST daily",      expectedGapMs: 30 * HOUR },
  { name: "admin-daily-insights", label: "Admin daily insights", schedule: "07:30 IST daily",      expectedGapMs: 30 * HOUR },
  { name: "morning-brief",        label: "Morning brief emails", schedule: "08:30 IST Mon–Sat",    expectedGapMs: 54 * HOUR, note: "skips Sunday" },
  { name: "exec-score-alert",     label: "Exec-score alert",     schedule: "15:00 IST Mon–Sat",    expectedGapMs: 54 * HOUR, note: "skips Sunday" },
  { name: "icp-regrade",          label: "ICP regrade",          schedule: "on account/icp.updated", expectedGapMs: null, note: "event-driven" },
]

export type JobHealth = {
  name: string
  label: string
  schedule: string
  note?: string
  lastRunAt: Date | null
  lastStatus: string | null
  lastError: string | null
  lastDurationMs: number | null
  /** true healthy · false stale-or-failed · null nothing to judge yet. */
  healthy: boolean | null
  /** Why it isn't healthy, in words. */
  reason: string | null
  runs24h: number
  failures24h: number
}

export async function getJobHealth(): Promise<JobHealth[]> {
  const since24 = new Date(Date.now() - 24 * HOUR)

  const [latest, runs, failures] = await Promise.all([
    Promise.all(
      JOB_SPECS.map((s) =>
        prisma.jobRun.findFirst({
          where: { function: s.name },
          orderBy: { started_at: "desc" },
          select: { status: true, started_at: true, finished_at: true, error: true },
        }),
      ),
    ),
    prisma.jobRun.groupBy({ by: ["function"], where: { started_at: { gte: since24 } }, _count: { _all: true } }),
    prisma.jobRun.groupBy({
      by: ["function"], where: { started_at: { gte: since24 }, status: "failed" }, _count: { _all: true },
    }),
  ])

  const runMap = new Map(runs.map((r) => [r.function, r._count._all]))
  const failMap = new Map(failures.map((r) => [r.function, r._count._all]))

  return JOB_SPECS.map((spec, i) => {
    const last = latest[i]
    const lastRunAt = last?.started_at ?? null
    const gap = lastRunAt ? Date.now() - lastRunAt.getTime() : null

    let healthy: boolean | null
    let reason: string | null = null

    if (spec.expectedGapMs == null) {
      // Event-driven: never stale. Only a failed last run is a problem.
      healthy = last == null ? null : last.status !== "failed"
      if (last?.status === "failed") reason = "last run failed"
    } else if (lastRunAt == null) {
      healthy = null
      reason = "never run"
    } else if (last?.status === "failed") {
      healthy = false
      reason = "last run failed"
    } else if (gap != null && gap > spec.expectedGapMs) {
      healthy = false
      reason = `no run in ${Math.round(gap / HOUR)}h (expected ${spec.schedule})`
    } else {
      healthy = true
    }

    return {
      name: spec.name,
      label: spec.label,
      schedule: spec.schedule,
      note: spec.note,
      lastRunAt,
      lastStatus: last?.status ?? null,
      lastError: last?.error ?? null,
      lastDurationMs:
        last?.started_at && last?.finished_at ? last.finished_at.getTime() - last.started_at.getTime() : null,
      healthy,
      reason,
      runs24h: runMap.get(spec.name) ?? 0,
      failures24h: failMap.get(spec.name) ?? 0,
    }
  })
}

export type JobRunRow = {
  id: string
  function: string
  status: string
  accountId: string | null
  items: number
  error: string | null
  startedAt: Date
  finishedAt: Date | null
  durationMs: number | null
}

export async function listJobRuns(opts: { fn?: string; status?: string; take?: number } = {}): Promise<JobRunRow[]> {
  const where: Prisma.JobRunWhereInput = {}
  if (opts.fn) where.function = opts.fn
  if (opts.status) where.status = opts.status

  const rows = await prisma.jobRun.findMany({
    where,
    orderBy: { started_at: "desc" },
    take: Math.min(300, opts.take ?? 100),
  })
  return rows.map((r) => ({
    id: r.id,
    function: r.function,
    status: r.status,
    accountId: r.account_id,
    items: r.items,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.finished_at ? r.finished_at.getTime() - r.started_at.getTime() : null,
  }))
}

// ── Errors ────────────────────────────────────────────────────────────────────
//
// The distinction that matters: a row skipped because the customer's CSV had no
// phone number is the product WORKING. A failed job or a 500 is the product
// BROKEN. Mixing them makes every import look like an outage — which is exactly
// how a routine skip gets mistaken for a bug.

export type ErrorClass = "expected" | "system"

export type ImportOutcome = {
  jobs: number
  totalRows: number
  inserted: number
  duplicates: number
  rowErrors: number
  failedJobs: number
  /** Row-level skips as a share of all rows processed. */
  skipRatePct: number | null
  insertRatePct: number | null
}

export type ErrorRow = {
  id: string
  kind: "import" | "email" | "sheet-sync" | "job"
  cls: ErrorClass
  accountId: string | null
  summary: string
  detail: string | null
  at: Date
}

export type ErrorCenter = {
  windowDays: number
  imports: ImportOutcome
  /** Expected, per-row skip reasons parsed out of import error strings. */
  skipReasons: { reason: string; count: number; pct: number }[]
  systemFailures: ErrorRow[]
  expectedSkips: ErrorRow[]
  emailFailures: number
  sheetFailures: number
  jobFailures: number
}

/**
 * Buckets a raw import error string into a stable reason code. The import path
 * writes free text, so this is a classifier over the known messages rather than
 * a stored enum — unmatched strings surface as OTHER instead of being dropped.
 */
export function classifyImportError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes("duplicate")) return "DUPLICATE"
  if (m.includes("phone")) return "INVALID_PHONE"
  if (m.includes("name")) return "MISSING_NAME"
  if (m.includes("email")) return "INVALID_EMAIL"
  if (m.includes("limit") || m.includes("cap") || m.includes("plan")) return "PLAN_LIMIT"
  if (m.includes("sheet") || m.includes("permission") || m.includes("access")) return "SHEET_NOT_ACCESSIBLE"
  if (m.includes("timeout") || m.includes("database") || m.includes("prisma")) return "DATABASE_ERROR"
  if (m.includes("internal") || m.includes("unexpected")) return "INTERNAL_ERROR"
  return "OTHER"
}

/** Which reason codes mean "the system broke", not "the data was imperfect". */
const SYSTEM_CODES = new Set(["DATABASE_ERROR", "INTERNAL_ERROR", "SHEET_NOT_ACCESSIBLE"])

export const SKIP_REASON_LABELS: Record<string, string> = {
  DUPLICATE:            "Duplicate phone (already in workspace)",
  INVALID_PHONE:        "Invalid / missing phone",
  MISSING_NAME:         "Missing name",
  INVALID_EMAIL:        "Invalid email",
  PLAN_LIMIT:           "Plan lead limit reached",
  SHEET_NOT_ACCESSIBLE: "Sheet not accessible",
  DATABASE_ERROR:       "Database error",
  INTERNAL_ERROR:       "Internal error",
  OTHER:                "Other",
}

export async function getErrorCenter(windowDays = 7): Promise<ErrorCenter> {
  const start = new Date(Date.now() - windowDays * 86_400_000)
  const inWindow = { created_at: { gte: start } }

  const [agg, jobCount, failedJobs, importRows, emailRows, sheetRows, jobRunFails] = await Promise.all([
    prisma.importJobStatus.aggregate({
      where: inWindow,
      _sum: { total_rows: true, inserted: true, duplicates: true, errors: true },
    }),
    prisma.importJobStatus.count({ where: inWindow }),
    prisma.importJobStatus.count({ where: { ...inWindow, status: ImportStatus.FAILED } }),
    prisma.importJobStatus.findMany({
      where: { ...inWindow, OR: [{ status: ImportStatus.FAILED }, { errors: { gt: 0 } }] },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true, account_id: true, status: true, file_name: true,
        errors: true, total_rows: true, error_detail: true, created_at: true,
      },
    }),
    prisma.emailLog.findMany({
      where: { ...inWindow, status: "failed" },
      orderBy: { created_at: "desc" },
      take: 50,
      select: { id: true, account_id: true, template: true, error: true, to_email: true, created_at: true },
    }),
    prisma.sheetSync.findMany({
      where: { last_status: { not: null, notIn: ["ok"] } },
      orderBy: { updated_at: "desc" },
      take: 50,
      select: { id: true, account_id: true, sheet_id: true, last_status: true, updated_at: true },
    }),
    prisma.jobRun.findMany({
      where: { started_at: { gte: start }, status: "failed" },
      orderBy: { started_at: "desc" },
      take: 50,
      select: { id: true, function: true, account_id: true, error: true, started_at: true },
    }),
  ])

  // Tally the per-row error strings stored on each job (error_detail is a JSON
  // array of up to 100 strings written by /api/import/csv/complete).
  const reasonCounts = new Map<string, number>()
  const expectedSkips: ErrorRow[] = []
  const systemFailures: ErrorRow[] = []

  for (const job of importRows) {
    const messages = Array.isArray(job.error_detail) ? (job.error_detail as unknown[]) : []
    const strings = messages.filter((m): m is string => typeof m === "string")
    for (const s of strings) {
      const code = classifyImportError(s)
      reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1)
    }

    const codes = new Set(strings.map(classifyImportError))
    const jobIsSystemFailure = job.status === ImportStatus.FAILED || Array.from(codes).some((c) => SYSTEM_CODES.has(c))
    const row: ErrorRow = {
      id: job.id,
      kind: "import",
      cls: jobIsSystemFailure ? "system" : "expected",
      accountId: job.account_id,
      summary:
        job.status === ImportStatus.FAILED
          ? `Import FAILED${job.file_name ? ` · ${job.file_name}` : ""}`
          : `${job.errors} of ${job.total_rows} rows skipped${job.file_name ? ` · ${job.file_name}` : ""}`,
      detail: strings.slice(0, 3).join(" · ") || null,
      at: job.created_at,
    }
    ;(jobIsSystemFailure ? systemFailures : expectedSkips).push(row)
  }

  for (const e of emailRows) {
    systemFailures.push({
      id: e.id, kind: "email", cls: "system", accountId: e.account_id,
      summary: `Email failed · ${e.template} → ${e.to_email}`,
      detail: e.error, at: e.created_at,
    })
  }
  for (const s of sheetRows) {
    systemFailures.push({
      id: s.id, kind: "sheet-sync", cls: "system", accountId: s.account_id,
      summary: `Sheet sync failing · ${s.sheet_id}`,
      detail: s.last_status, at: s.updated_at,
    })
  }
  for (const j of jobRunFails) {
    systemFailures.push({
      id: j.id, kind: "job", cls: "system", accountId: j.account_id,
      summary: `Job failed · ${j.function}`,
      detail: j.error, at: j.started_at,
    })
  }

  systemFailures.sort((a, b) => b.at.getTime() - a.at.getTime())
  expectedSkips.sort((a, b) => b.at.getTime() - a.at.getTime())

  const totalRows = agg._sum.total_rows ?? 0
  const inserted = agg._sum.inserted ?? 0
  const rowErrors = agg._sum.errors ?? 0
  const totalTagged = Array.from(reasonCounts.values()).reduce((a, b) => a + b, 0)

  return {
    windowDays,
    imports: {
      jobs: jobCount,
      totalRows,
      inserted,
      duplicates: agg._sum.duplicates ?? 0,
      rowErrors,
      failedJobs,
      skipRatePct: totalRows > 0 ? Math.round((rowErrors / totalRows) * 1000) / 10 : null,
      insertRatePct: totalRows > 0 ? Math.round((inserted / totalRows) * 1000) / 10 : null,
    },
    skipReasons: Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        pct: totalTagged > 0 ? Math.round((count / totalTagged) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count),
    systemFailures: systemFailures.slice(0, 60),
    expectedSkips: expectedSkips.slice(0, 60),
    emailFailures: emailRows.length,
    sheetFailures: sheetRows.length,
    jobFailures: jobRunFails.length,
  }
}

// ── Integrations ──────────────────────────────────────────────────────────────

export type Integration = {
  key: string
  name: string
  /** connected · degraded · not-configured · unknown */
  status: "connected" | "degraded" | "not-configured" | "unknown"
  detail: string
  lastActivityAt: Date | null
  stats: { label: string; value: string }[]
}

export async function getIntegrations(): Promise<Integration[]> {
  const dayStart = startOfIstDay()

  const [
    sheetsTotal, sheetsActive, sheetsFailing, sheetsLast, sheetsSynced,
    emailsToday, emailsFailedToday, emailOpens, lastEmail,
    subsWithProvider, paymentsCount, lastPayment, webhookEvents, lastWebhook,
    lastJobRun, importsToday, apiRateKeys, lastSignupAlert, adminRecipients,
  ] = await Promise.all([
    prisma.sheetSync.count(),
    prisma.sheetSync.count({ where: { is_active: true } }),
    prisma.sheetSync.count({ where: { is_active: true, last_status: { not: null, notIn: ["ok"] } } }),
    prisma.sheetSync.aggregate({ _max: { last_synced_at: true } }),
    prisma.sheetSync.aggregate({ _sum: { total_synced: true } }),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "sent" } }),
    prisma.emailLog.count({ where: { created_at: { gte: dayStart }, status: "failed" } }),
    prisma.emailLog.count({ where: { opened_at: { not: null } } }),
    prisma.emailLog.aggregate({ _max: { created_at: true } }),
    prisma.subscription.count({ where: { provider: { not: null } } }),
    prisma.payment.count(),
    prisma.payment.aggregate({ _max: { created_at: true } }),
    prisma.webhookEvent.count(),
    prisma.webhookEvent.aggregate({ _max: { processed_at: true } }),
    prisma.jobRun.aggregate({ _max: { started_at: true } }),
    prisma.importJobStatus.count({ where: { created_at: { gte: dayStart } } }),
    prisma.rateLimit.count(),
    prisma.jobRun.findFirst({
      where: { function: "signup-alert" },
      orderBy: { started_at: "desc" },
      select: { status: true, started_at: true },
    }),
    getAdminRecipients().then((r) => r.length).catch(() => 0),
  ])

  const recentJob = lastJobRun._max.started_at
  const inngestHealthy = recentJob != null && Date.now() - recentJob.getTime() < 4 * HOUR

  return [
    {
      key: "google-sheets",
      name: "Google Sheets",
      status: sheetsTotal === 0 ? "not-configured" : sheetsFailing > 0 ? "degraded" : "connected",
      detail:
        sheetsTotal === 0
          ? "No customer has connected a sheet yet."
          : sheetsFailing > 0
            ? `${sheetsFailing} of ${sheetsActive} active connections are erroring.`
            : `${sheetsActive} active connections, all syncing.`,
      lastActivityAt: sheetsLast._max.last_synced_at,
      stats: [
        { label: "Connections", value: String(sheetsTotal) },
        { label: "Active", value: String(sheetsActive) },
        { label: "Failing", value: String(sheetsFailing) },
        { label: "Leads synced (all time)", value: String(sheetsSynced._sum.total_synced ?? 0) },
      ],
    },
    {
      key: "resend",
      name: "Resend (email)",
      status:
        emailsToday + emailsFailedToday === 0 ? "unknown" : emailsFailedToday > 0 ? "degraded" : "connected",
      detail:
        emailsToday + emailsFailedToday === 0
          ? "No sends today — status unknown rather than healthy."
          : emailsFailedToday > 0
            ? `${emailsFailedToday} failed send${emailsFailedToday === 1 ? "" : "s"} today.`
            : "All sends accepted today.",
      lastActivityAt: lastEmail._max.created_at,
      stats: [
        { label: "Sent today", value: String(emailsToday) },
        { label: "Failed today", value: String(emailsFailedToday) },
        { label: "Opens recorded", value: emailOpens > 0 ? String(emailOpens) : "0 — webhook?" },
      ],
    },
    {
      key: "razorpay",
      name: "Razorpay (billing)",
      status: subsWithProvider === 0 && paymentsCount === 0 ? "not-configured" : "connected",
      detail:
        subsWithProvider === 0 && paymentsCount === 0
          ? "No provider-backed subscription yet — plans are being set manually."
          : `${subsWithProvider} provider-backed subscription${subsWithProvider === 1 ? "" : "s"}, ${paymentsCount} payment${paymentsCount === 1 ? "" : "s"} recorded.`,
      lastActivityAt: lastPayment._max.created_at ?? lastWebhook._max.processed_at,
      stats: [
        { label: "Provider subscriptions", value: String(subsWithProvider) },
        { label: "Payments", value: String(paymentsCount) },
        { label: "Webhook events", value: String(webhookEvents) },
      ],
    },
    {
      key: "inngest",
      name: "Inngest (background jobs)",
      status: recentJob == null ? "unknown" : inngestHealthy ? "connected" : "degraded",
      detail:
        recentJob == null
          ? "No job has ever recorded a run."
          : inngestHealthy
            ? "Jobs are firing on schedule."
            : "No job has run in over 4 hours — the shortest cron is every 5 minutes.",
      lastActivityAt: recentJob,
      stats: [{ label: "Scheduled functions", value: String(JOB_SPECS.length) }],
    },
    {
      key: "supabase",
      name: "Supabase (database + auth)",
      status: "connected",
      detail: "Serving every request — if this were down you would not be reading this page.",
      lastActivityAt: new Date(),
      stats: [
        { label: "Imports today", value: String(importsToday) },
        { label: "Live rate-limit keys", value: String(apiRateKeys) },
      ],
    },
    {
      key: "slack",
      name: "Slack (admin alerts)",
      status: slackConfigured() ? "connected" : "not-configured",
      detail: slackConfigured()
        ? "New-signup alerts are mirrored to Slack alongside the admin email."
        : "Optional. Set ADMIN_SLACK_WEBHOOK_URL to an incoming-webhook URL and new-signup alerts will post there too. Email is unaffected either way.",
      lastActivityAt: lastSignupAlert?.started_at ?? null,
      stats: [
        { label: "Alert job", value: lastSignupAlert ? lastSignupAlert.status : "never run" },
        { label: "Admin recipients", value: String(adminRecipients) },
      ],
    },
    {
      key: "whatsapp",
      name: "WhatsApp",
      status: "not-configured",
      detail:
        "Manual logging only — the app opens the rep's own WhatsApp and records the outcome. No BSP (Gupshup/Twilio/WATI) is connected, so there is nothing to monitor here yet.",
      lastActivityAt: null,
      stats: [],
    },
  ]
}
