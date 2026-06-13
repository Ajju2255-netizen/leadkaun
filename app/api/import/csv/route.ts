import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { mapHeader } from "@/lib/import/column-map"
import { validateRow } from "@/lib/import/validate-row"
import { generateImportSignals } from "@/lib/import/generate-signals"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"
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

    const nameParam = (formData.get("name") as string | null)?.trim() || null

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

    // ── Auto-generate session name if not provided ──────────────────────────
    const dateStr = new Date().toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    })
    const sessionName = nameParam ?? `Import · ${dateStr} · ${source.name}`

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
        name:         sessionName,
        file_name:    file.name,
        source_id:    sourceId,
      },
    })

    // ── Process rows ─────────────────────────────────────────────────────────
    const BATCH_SIZE     = 50
    let inserted         = 0
    let duplicates       = 0
    let errors           = 0
    let highIntentCount  = 0   // leads graded A or B
    let totalValue       = 0   // sum of expected_value
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

        // ── Generate import-inferred signals (intent derives from these) ────
        const inferredSignals = generateImportSignals({
          interest_level:    vr.interest_level,
          last_contact_days: vr.last_contact_days,
          notes:             vr.inquiry_text,
        })

        // ── Create lead + signals, then let the scoring engine assign the
        //    canonical fit/intent/quality/grade. The orchestrator is the single
        //    source of truth (audit B2): no import-only 2× multiplier or notes
        //    grade override, so the grade here is identical to every later
        //    recompute. Notes intent is captured via the IMPORT_* signals that
        //    generateImportSignals() already derives from the notes text. ──────
        try {
          const scoring = await prisma.$transaction(async (tx) => {
            const created = await tx.lead.create({
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
                import_job_id:  job.id,
                inquiry_text:   vr.inquiry_text,
                expected_value: vr.expected_value,
                signals: {
                  // SOURCE_BASELINE + every import-inferred signal. computeIntentScore
                  // sums ALL persisted signal_values, so persisting these keeps the
                  // intent reproducible on every recompute/decay (audit B2).
                  create: [
                    {
                      account_id:           session.account.id,
                      signal_type:          "SOURCE_BASELINE" as const,
                      signal_value:         source.intent_baseline,
                      raw_value:            { source_key: source.key, import_job_id: job.id },
                      lead_grade_at_signal: "E" as const,
                      intent_score_before:  0,
                      intent_score_after:   source.intent_baseline,
                    },
                    ...inferredSignals.map((s) => ({
                      account_id:           session.account.id,
                      signal_type:          s.signal_type,
                      signal_value:         s.signal_value,
                      raw_value:            { source: "import_inference", import_job_id: job.id },
                      lead_grade_at_signal: "E" as const,
                      intent_score_before:  source.intent_baseline,
                      intent_score_after:   source.intent_baseline,
                    })),
                  ],
                },
              },
              select: { id: true },
            })
            return processSignalAndUpdateScores(created.id, session.account.id, tx)
          })
          // Track high-intent leads and total value
          if (scoring.grade === "A" || scoring.grade === "B") highIntentCount++
          if (vr.expected_value) totalValue += vr.expected_value
        } catch (rowErr) {
          const reason = `Row ${rowIndex} ("${vr.first_name}" / ${vr.phone}): DB error — ${String(rowErr)}`
          errors++
          console.error(`[import:${job.id}] ERR ${reason}`)
          if (errorLog.length < MAX_STORED_ERRORS) errorLog.push(reason)
          continue
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

    // ── Regrade any stale E leads in this account (catches pre-fix imports) ──
    //    Routes through the same orchestrator as everything else so grades are
    //    computed identically (audit B2 — single source of truth).
    try {
      const staleLeads = await prisma.lead.findMany({
        where: { account_id: session.account.id, grade: "E", is_junk: false },
        select: { id: true },
      })
      for (const stale of staleLeads) {
        try {
          await prisma.$transaction((tx) =>
            processSignalAndUpdateScores(stale.id, session.account.id, tx),
          )
        } catch (e) {
          console.warn(`[import] Regrade failed for ${stale.id}:`, String(e))
        }
      }
    } catch (regradeErr) {
      console.warn("[import] Regrade sweep failed:", String(regradeErr))
    }

    // ── Mark complete ────────────────────────────────────────────────────────
    await prisma.importJobStatus.update({
      where: { id: job.id },
      data: {
        status:            "COMPLETE",
        inserted,
        duplicates,
        errors,
        progress_pct:      100,
        completed_at:      new Date(),
        high_intent_count: highIntentCount,
        total_value:       totalValue,
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
