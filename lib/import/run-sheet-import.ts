import { prisma } from "@/lib/prisma"
import { processImportRows } from "@/lib/import/process-rows"
import { leadsRemaining } from "@/lib/billing/lead-usage"
import { recordAccountEvent } from "@/lib/events/account-events"

/**
 * Shared "import parsed rows under a fresh import job" runner — used by both the
 * one-time Google Sheets route and the background auto-sync cron. Creates the
 * job, streams rows through the canonical validate→dedupe→score pipeline in
 * chunks (enforcing the plan lead-cap), finalises the job, and records the
 * account event. Dedup by phone makes re-runs idempotent, so the sync can pull
 * the whole sheet each time and only ever insert genuinely new leads.
 */

const CHUNK = 100

/** Max rows processed in a single run (a transaction per row stays under limits). */
export const SHEET_PULL_MAX = 2000

export interface RunSheetImportOpts {
  accountId:    string
  workspaceId:  string
  userId:       string
  sourceId:     string
  stageId:      string
  source:       { key: string; intent_baseline: number }
  rows:         Record<string, string>[]
  name:         string
  fileName?:    string
  sourceCollectedAt?: Date | null
  /** Tag for the account-event detail (e.g. "google_sheets" | "google_sheets_sync"). */
  eventSource?: string
}

export interface RunSheetImportResult {
  jobId:           string
  inserted:        number
  duplicates:      number
  errors:          number
  highIntentCount: number
  totalValue:      number
  errorReasons:    string[]
  limitReached:    boolean
  processedRows:   number
}

export async function runSheetImport(opts: RunSheetImportOpts): Promise<RunSheetImportResult> {
  const {
    accountId, workspaceId, userId, sourceId, stageId, source, name,
    fileName = "Google Sheet", sourceCollectedAt = null, eventSource = "google_sheets",
  } = opts
  const rows = opts.rows.slice(0, SHEET_PULL_MAX)

  const job = await prisma.importJobStatus.create({
    data: {
      account_id: accountId, workspace_id: workspaceId, user_id: userId,
      status: "PROCESSING", total_rows: rows.length, progress_pct: 0,
      inserted: 0, duplicates: 0, errors: 0,
      name, file_name: fileName, source_id: sourceId,
    },
  })

  let inserted = 0, duplicates = 0, errors = 0, highIntentCount = 0, totalValue = 0, processed = 0
  const errorReasons: string[] = []
  let limitReached = false

  for (let i = 0; i < rows.length; i += CHUNK) {
    const left = await leadsRemaining(accountId)
    if (left <= 0) { limitReached = true; break }
    const slice = rows.slice(i, i + CHUNK)
    const capped = left < slice.length ? slice.slice(0, left) : slice
    if (capped.length < slice.length) limitReached = true

    const r = await processImportRows({
      rows: capped, startRowIndex: i + 2,
      accountId, workspaceId, sourceId, stageId, jobId: job.id,
      source, sourceCollectedAt,
    })
    inserted += r.inserted; duplicates += r.duplicates; errors += r.errors
    highIntentCount += r.highIntentCount; totalValue += r.totalValue
    processed += capped.length
    for (const reason of r.errorReasons) if (errorReasons.length < 100) errorReasons.push(reason)

    await prisma.importJobStatus.update({
      where: { id: job.id },
      data: {
        inserted: { increment: r.inserted }, duplicates: { increment: r.duplicates },
        errors: { increment: r.errors }, high_intent_count: { increment: r.highIntentCount },
        total_value: { increment: r.totalValue },
        progress_pct: Math.min(99, Math.round(((i + capped.length) / rows.length) * 100)),
      },
    })
    if (limitReached) break
  }

  await prisma.importJobStatus.update({
    where: { id: job.id },
    data: {
      status: "COMPLETE", progress_pct: 100, completed_at: new Date(),
      ...(errorReasons.length > 0 && {
        error_detail: { total_errors: errors, shown: errorReasons.length, truncated: errors > errorReasons.length, rows: errorReasons },
      }),
    },
  })

  await recordAccountEvent({
    accountId, workspaceId, actorUserId: userId,
    type: "IMPORT_COMPLETED",
    summary: `Imported ${inserted} leads from Google Sheets${duplicates ? `, ${duplicates} duplicates` : ""}`,
    detail: { inserted, duplicates, errors, source: eventSource },
  })

  return { jobId: job.id, inserted, duplicates, errors, highIntentCount, totalValue, errorReasons, limitReached, processedRows: processed }
}
