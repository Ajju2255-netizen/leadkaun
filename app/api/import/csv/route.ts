import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { mapHeader } from "@/lib/import/column-map"
import { validateRow } from "@/lib/import/validate-row"
import { generateImportSignals } from "@/lib/import/generate-signals"
import { computeFitScore } from "@/lib/scoring/fit-score"
import { computeQualityScore } from "@/lib/scoring/quality-score"
import { assignGrade } from "@/lib/scoring/grade"
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

    // ── Fetch account ICP config once — used for fit score on every row ──────
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: session.account.id },
      select: {
        icp_configured:    true,
        icp_industries:    true,
        icp_states:        true,
        icp_business_types:true,
        icp_roles:         true,
        icp_budget_min:    true,
        icp_budget_max:    true,
      },
    })

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

        // ── Compute scores from validated data (no DB round-trip needed) ────
        const inferredSignals = generateImportSignals({
          interest_level:    vr.interest_level,
          last_contact_days: vr.last_contact_days,
          notes:             vr.inquiry_text,
        })

        // Intent = source baseline + any inferred signal values
        // (inferred signals are best-effort; if migration not run their values
        //  are 0 via the fallback in generate-signals.ts, so this stays safe)
        const intentScore = Math.min(
          100,
          Math.max(
            source.intent_baseline,
            source.intent_baseline + inferredSignals.reduce((acc, s) => acc + s.signal_value, 0),
          ),
        )

        const fitResult = computeFitScore({
          lead: {
            industry:       undefined,  // not captured in CSV import — partial credit applied
            state:          vr.state ?? undefined,
            city:           vr.city ?? undefined,
            company_name:   vr.company_name ?? undefined,
            designation:    vr.designation ?? undefined,
            expected_value: vr.expected_value ?? undefined,
          },
          icp: account,
        })

        const qualityResult = computeQualityScore({
          phone:              vr.phone,
          email:              vr.email,
          company_name:       vr.company_name,
          inquiry_text:       vr.inquiry_text,
          source_reliability: source.reliability_score,
          junk_flags:         [],
          is_junk:            false,
        })

        const grade = assignGrade(fitResult.total, intentScore, qualityResult.total)

        // ── Create lead + SOURCE_BASELINE + initial scores (atomic) ──────────
        try {
          await prisma.$transaction(async (tx) => {
            await tx.lead.create({
              data: {
                account_id:              session.account.id,
                first_name:              vr.first_name,
                last_name:               vr.last_name,
                phone:                   vr.phone,
                phone_raw:               vr.phone_raw,
                email:                   vr.email,
                company_name:            vr.company_name,
                designation:             vr.designation,
                city:                    vr.city,
                state:                   vr.state,
                pincode:                 vr.pincode,
                source_id:               sourceId,
                stage_id:                stageId,
                inquiry_text:            vr.inquiry_text,
                expected_value:          vr.expected_value,
                // Scores written at creation — no separate update needed
                fit_score:               fitResult.total,
                intent_score:            intentScore,
                quality_score:           qualityResult.total,
                grade,
                fit_score_breakdown:     fitResult.breakdown as object,
                quality_score_breakdown: qualityResult.breakdown as object,
                signals: {
                  create: {
                    account_id:           session.account.id,
                    signal_type:          "SOURCE_BASELINE",
                    signal_value:         source.intent_baseline,
                    raw_value:            { source_key: source.key, import_job_id: job.id },
                    lead_grade_at_signal: grade,
                    intent_score_before:  0,
                    intent_score_after:   intentScore,
                  },
                },
              },
            })
          })
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
    try {
      const staleLeads = await prisma.lead.findMany({
        where: { account_id: session.account.id, grade: "E", is_junk: false },
        select: { id: true },
      })
      for (const lead of staleLeads) {
        const signals = await prisma.signal.findMany({
          where: { lead_id: lead.id },
          select: { signal_type: true, signal_value: true },
        })
        const leadData = await prisma.lead.findUniqueOrThrow({
          where: { id: lead.id },
          include: { source: true },
        })
        const intentScore = Math.min(
          100,
          signals.reduce((acc, s) => acc + s.signal_value, leadData.source.intent_baseline),
        )
        const fitResult     = computeFitScore({ lead: leadData, icp: account })
        const qualityResult = computeQualityScore({
          phone:              leadData.phone,
          email:              leadData.email,
          company_name:       leadData.company_name,
          inquiry_text:       leadData.inquiry_text,
          source_reliability: leadData.source.reliability_score,
          junk_flags:         leadData.junk_flags,
          is_junk:            leadData.is_junk,
        })
        const newGrade = assignGrade(fitResult.total, intentScore, qualityResult.total)
        if (newGrade !== "E") {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              grade:                   newGrade,
              fit_score:               fitResult.total,
              intent_score:            intentScore,
              quality_score:           qualityResult.total,
              fit_score_breakdown:     fitResult.breakdown as object,
              quality_score_breakdown: qualityResult.breakdown as object,
            },
          })
        }
      }
    } catch (regradeErr) {
      console.warn("[import] Regrade sweep failed:", String(regradeErr))
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
