import { prisma } from "@/lib/prisma"
import { validateRow } from "@/lib/import/validate-row"
import { generateImportSignals } from "@/lib/import/generate-signals"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"

/**
 * Shared per-row import processing — the single source of truth used by both
 * the one-shot /api/import/csv route (onboarding) and the batched
 * /api/import/csv/batch endpoint (the main import page streams rows through it).
 *
 * For each row: validate → dedupe by phone → create the lead + its baseline +
 * inferred signals → let the scoring orchestrator assign the canonical
 * fit/intent/quality/grade. Errors never abort the run; they're counted and the
 * first MAX_STORED_ERRORS reasons are returned for display.
 */

export const MAX_STORED_ERRORS = 100

/** Hard ceiling on rows in a single import (server-enforced; the client also caps the file at 10 MB). */
export const MAX_IMPORT_ROWS = 100_000
/** Max rows accepted in one /api/import/csv/batch request. */
export const MAX_BATCH_ROWS = 200

export interface ProcessRowsResult {
  inserted:        number
  duplicates:      number
  errors:          number
  highIntentCount: number   // graded A or B
  totalValue:      number   // sum of expected_value
  errorReasons:    string[] // capped at MAX_STORED_ERRORS
}

export interface ProcessRowsOpts {
  rows:          Record<string, string>[]
  /** 1-based CSV row number of rows[0] (header is row 1, so first data row = 2). */
  startRowIndex: number
  accountId:     string
  workspaceId:   string
  sourceId:      string
  stageId:       string
  jobId:         string
  source:        { key: string; intent_baseline: number }
  /** Approximate source-collection date for this import (freshness). Null = unspecified. */
  sourceCollectedAt?: Date | null
}

export async function processImportRows(opts: ProcessRowsOpts): Promise<ProcessRowsResult> {
  const { rows, startRowIndex, accountId, workspaceId, sourceId, stageId, jobId, source, sourceCollectedAt } = opts

  let inserted = 0, duplicates = 0, errors = 0, highIntentCount = 0, totalValue = 0
  const errorReasons: string[] = []
  const pushErr = (reason: string) => {
    if (errorReasons.length < MAX_STORED_ERRORS) errorReasons.push(reason)
  }

  for (let j = 0; j < rows.length; j++) {
    const row      = rows[j]
    const rowIndex = startRowIndex + j

    // ── Validate + normalise ──────────────────────────────────────────────
    const validation = validateRow(row, rowIndex)
    if (!validation.ok) {
      errors++
      console.error(`[import:${jobId}] SKIP ${validation.reason}`)
      pushErr(validation.reason)
      continue
    }
    const vr = validation.data

    // ── Duplicate check (by workspace + canonical phone) ──────────────────
    try {
      const exists = await prisma.lead.findFirst({
        where: { workspace_id: workspaceId, phone: vr.phone },
      })
      if (exists) { duplicates++; continue }
    } catch (dupErr) {
      errors++
      const reason = `Row ${rowIndex} ("${vr.first_name}"): duplicate check failed — ${String(dupErr)}`
      console.error(`[import:${jobId}] ERR ${reason}`)
      pushErr(reason)
      continue
    }

    // ── Import-inferred signals (intent derives from these) ────────────────
    const inferredSignals = generateImportSignals({
      interest_level:    vr.interest_level,
      last_contact_days: vr.last_contact_days,
      notes:             vr.inquiry_text,
    })

    // ── Create lead + signals, then score via the orchestrator (single
    //    source of truth — identical grade to every later recompute). ───────
    try {
      const scoring = await prisma.$transaction(async (tx) => {
        const created = await tx.lead.create({
          data: {
            account_id:     accountId,
            workspace_id:   workspaceId,
            first_name:     vr.first_name,
            last_name:      vr.last_name,
            phone:          vr.phone,
            phone_raw:      vr.phone_raw,
            email:          vr.email,
            company_name:   vr.company_name,
            designation:    vr.designation,
            city:           vr.city,
            state:          vr.state,
            pincode:        vr.pincode,
            source_id:      sourceId,
            stage_id:       stageId,
            import_job_id:  jobId,
            source_collected_at: sourceCollectedAt ?? null,
            inquiry_text:   vr.inquiry_text,
            expected_value: vr.expected_value,
            signals: {
              create: [
                {
                  account_id:           accountId,
                  workspace_id:         workspaceId,
                  signal_type:          "SOURCE_BASELINE" as const,
                  signal_value:         source.intent_baseline,
                  raw_value:            { source_key: source.key, import_job_id: jobId },
                  lead_grade_at_signal: "E" as const,
                  intent_score_before:  0,
                  intent_score_after:   source.intent_baseline,
                },
                ...inferredSignals.map((s) => ({
                  account_id:           accountId,
                  workspace_id:         workspaceId,
                  signal_type:          s.signal_type,
                  signal_value:         s.signal_value,
                  raw_value:            { source: "import_inference", import_job_id: jobId },
                  lead_grade_at_signal: "E" as const,
                  intent_score_before:  source.intent_baseline,
                  intent_score_after:   source.intent_baseline,
                })),
              ],
            },
          },
          select: { id: true },
        })
        return processSignalAndUpdateScores(created.id, accountId, tx)
      })
      if (scoring.grade === "A" || scoring.grade === "B") highIntentCount++
      if (vr.expected_value) totalValue += vr.expected_value
    } catch (rowErr) {
      errors++
      const reason = `Row ${rowIndex} ("${vr.first_name}" / ${vr.phone}): DB error — ${String(rowErr)}`
      console.error(`[import:${jobId}] ERR ${reason}`)
      pushErr(reason)
      continue
    }

    inserted++
  }

  return { inserted, duplicates, errors, highIntentCount, totalValue, errorReasons }
}
