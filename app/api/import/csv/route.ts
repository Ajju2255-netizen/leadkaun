import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"
import { mapHeader } from "@/lib/import/column-map"
import { validateRow } from "@/lib/import/validate-row"
import { generateImportSignals } from "@/lib/import/generate-signals"
import Papa from "papaparse"

// Vercel Pro max function duration — allows processing large CSVs inline
export const maxDuration = 300

// Max CSV file size: 10 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Store at most this many per-row error strings in error_detail JSON.
// Keeps the payload small even for large broken CSVs.
const MAX_STORED_ERRORS = 100

/**
 * POST /api/import/csv
 *
 * Validates, normalises and imports CSV rows inline (no Inngest dependency).
 *
 * Validation rules:
 *   REQUIRED:  name, phone (Indian mobile — with or without country code)
 *   OPTIONAL:  everything else
 *   SKIPPED:   duplicates (same phone in same account)
 *
 * Errors:
 *   • Per-row errors are logged with row number + exact reason
 *   • First MAX_STORED_ERRORS are persisted in ImportJobStatus.error_detail
 *   • The job always reaches COMPLETE — errors never abort the whole import
 *
 * Admin/Manager only.
 */
export async function POST(req: Request) {
  try {
    const session = await requireAuth()

    if (session.user.role === "REP") {
      return apiError("Only Admins and Managers can import leads", "FORBIDDEN", 403)
    }

    const formData = await req.formData()
    const file     = formData.get("file") as File | null
    const sourceId = formData.get("source_id") as string | null
    const stageId  = formData.get("stage_id") as string | null

    if (!file)     return apiError("No file provided", "MISSING_FILE", 422)
    if (!sourceId) return apiError("source_id is required", "MISSING_SOURCE", 422)
    if (!stageId)  return apiError("stage_id is required", "MISSING_STAGE", 422)

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith(".csv") && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      return apiError("Only CSV files are supported", "INVALID_FILE_TYPE", 422)
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError("File size must be under 10 MB", "FILE_TOO_LARGE", 422)
    }

    // Validate source and stage belong to this account
    const [source, stage] = await Promise.all([
      prisma.leadSource.findFirst({ where: { id: sourceId, account_id: session.account.id } }),
      prisma.pipelineStage.findFirst({ where: { id: stageId, account_id: session.account.id } }),
    ])

    if (!source) return apiError("Lead source not found", "NOT_FOUND", 404)
    if (!stage)  return apiError("Pipeline stage not found", "NOT_FOUND", 404)

    // ── Decode CSV ───────────────────────────────────────────────────────────
    const buffer  = Buffer.from(await file.arrayBuffer())
    // Detect encoding: if the utf-8 decode has replacement chars, try Windows-1252
    const utf8Try = buffer.toString("utf-8")
    const csvText = utf8Try.includes("\uFFFD")
      ? new TextDecoder("windows-1252").decode(buffer)
      : utf8Try

    // ── Parse with expanded header map ───────────────────────────────────────
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header:          true,
      skipEmptyLines:  true,
      transformHeader: mapHeader,  // uses COLUMN_MAP + fuzzy fallback
    })

    const rows      = parsed.data
    const totalRows = rows.length

    if (totalRows === 0) {
      return apiError("CSV file is empty or has no valid rows", "EMPTY_CSV", 422)
    }

    // Log detected column keys so they appear in Vercel logs for debugging
    console.log(`[import] Detected columns (${totalRows} rows):`, Object.keys(rows[0] ?? {}))

    // Log Papa parse warnings (mismatched column counts etc.) to server console
    if (parsed.errors.length > 0) {
      console.warn(`CSV parse warnings (${parsed.errors.length}):`, parsed.errors.slice(0, 5))
    }

    // ── Create job record ────────────────────────────────────────────────────
    const job = await prisma.importJobStatus.create({
      data: {
        account_id:   session.account.id,
        user_id:      session.user.id,
        status:       "PROCESSING",
        total_rows:   totalRows,
        progress_pct: 0,
        inserted:     0,
        duplicates:   0,
        errors:       0,
      },
    })

    // ── Process rows ─────────────────────────────────────────────────────────
    const BATCH_SIZE  = 50
    let inserted      = 0
    let duplicates    = 0
    let errors        = 0
    const errorLog: string[] = []   // stored in error_detail at the end

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)

      for (let j = 0; j < batch.length; j++) {
        const row      = batch[j]
        const rowIndex = i + j + 2   // +2: 1-based + header row

        // ── Validate + normalise ──────────────────────────────────────────
        const validation = validateRow(row, rowIndex)

        if (!validation.ok) {
          errors++
          console.error(`[import:${job.id}] SKIP ${validation.reason}`)
          if (errorLog.length < MAX_STORED_ERRORS) errorLog.push(validation.reason)
          continue
        }

        const vr = validation.data

        // ── Duplicate check ───────────────────────────────────────────────
        try {
          const exists = await prisma.lead.findUnique({
            where: { account_id_phone: { account_id: session.account.id, phone: vr.phone } },
          })
          if (exists) {
            duplicates++
            continue
          }
        } catch (dupErr) {
          const reason = `Row ${rowIndex} ("${vr.first_name}"): duplicate check failed — ${String(dupErr)}`
          errors++
          console.error(`[import:${job.id}] ERR ${reason}`)
          if (errorLog.length < MAX_STORED_ERRORS) errorLog.push(reason)
          continue
        }

        // ── Create lead + SOURCE_BASELINE (atomic) ────────────────────────
        let leadId!: string
        try {
          const lead = await prisma.$transaction(async (tx) => {
            const newLead = await tx.lead.create({
              data: {
                account_id:     session.account.id,
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
                inquiry_text:   vr.inquiry_text,
                expected_value: vr.expected_value,
              },
            })

            // SOURCE_BASELINE — always first; establishes intent floor
            await tx.signal.create({
              data: {
                account_id:           session.account.id,
                lead_id:              newLead.id,
                signal_type:          "SOURCE_BASELINE",
                signal_value:         source.intent_baseline,
                raw_value:            { source_key: source.key, import_job_id: job.id },
                lead_grade_at_signal: "E",
                intent_score_before:  0,
                intent_score_after:   source.intent_baseline,
              },
            })

            return newLead
          })
          leadId = lead.id
        } catch (rowErr) {
          const reason = `Row ${rowIndex} ("${vr.first_name}" / ${vr.phone}): DB error — ${String(rowErr)}`
          errors++
          console.error(`[import:${job.id}] ERR ${reason}`)
          if (errorLog.length < MAX_STORED_ERRORS) errorLog.push(reason)
          continue
        }

        // ── Inferred signals (best-effort — skipped if DB enum not yet migrated) ──
        const inferredSignals = generateImportSignals({
          interest_level:    vr.interest_level,
          last_contact_days: vr.last_contact_days,
          notes:             vr.inquiry_text,
        })

        if (inferredSignals.length > 0) {
          try {
            await prisma.signal.createMany({
              data: inferredSignals.map((s) => ({
                account_id:           session.account.id,
                lead_id:              leadId,
                signal_type:          s.signal_type,
                signal_value:         s.signal_value,
                raw_value:            { source: "csv_import", import_job_id: job.id },
                lead_grade_at_signal: "E",
                intent_score_before:  0,
                intent_score_after:   0,
              })),
            })
          } catch (sigErr) {
            // Migration for new signal types may not yet be applied — skip inferred
            // signals silently so lead creation is never blocked by this.
            console.warn(`[import:${job.id}] Inferred signals skipped for row ${rowIndex} — ${String(sigErr)}`)
          }
        }

        // ── Compute scores with all available signals ─────────────────────
        try {
          await processSignalAndUpdateScores(leadId, session.account.id, prisma)
        } catch (scoreErr) {
          console.warn(`[import:${job.id}] Score update failed for row ${rowIndex} — ${String(scoreErr)}`)
        }

        inserted++
      }

      // Update progress counters after each batch
      const pct = Math.min(99, Math.round(((i + batch.length) / totalRows) * 100))
      await prisma.importJobStatus.update({
        where: { id: job.id },
        data: { inserted, duplicates, errors, progress_pct: pct },
      })
    }

    // ── Mark complete ────────────────────────────────────────────────────────
    await prisma.importJobStatus.update({
      where: { id: job.id },
      data: {
        status:       "COMPLETE",
        inserted,
        duplicates,
        errors,
        progress_pct: 100,
        completed_at: new Date(),
        ...(errorLog.length > 0 && {
          error_detail: {
            total_errors: errors,
            shown:        errorLog.length,
            truncated:    errors > MAX_STORED_ERRORS,
            rows:         errorLog,
          },
        }),
      },
    })

    return apiSuccess({ jobId: job.id }, 201)

  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("CSV import error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
