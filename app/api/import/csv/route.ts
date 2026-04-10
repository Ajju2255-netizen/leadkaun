import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"
import { normalisePhone } from "@/lib/import/phone-normalise"
import { generateImportSignals } from "@/lib/import/generate-signals"
import Papa from "papaparse"

// Vercel Pro max function duration — allows processing large CSVs inline
export const maxDuration = 300

// Max CSV file size: 10 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Column name aliases — maps common CSV headers to our field names
const COLUMN_MAP: Record<string, string> = {
  "first name":     "first_name",
  "firstname":      "first_name",
  "name":           "first_name",
  "full name":      "first_name",
  "last name":      "last_name",
  "lastname":       "last_name",
  "surname":        "last_name",
  "mobile":         "phone",
  "phone":          "phone",
  "phone number":   "phone",
  "mobile number":  "phone",
  "contact":        "phone",
  "contact number": "phone",
  "email":          "email",
  "email address":  "email",
  "company":        "company_name",
  "company name":   "company_name",
  "organisation":   "company_name",
  "organization":   "company_name",
  "designation":    "designation",
  "role":           "designation",
  "job title":      "designation",
  "city":           "city",
  "state":          "state",
  "pincode":        "pincode",
  "zip":            "pincode",
  "zip code":       "pincode",
  "inquiry":        "inquiry_text",
  "message":        "inquiry_text",
  "remarks":        "inquiry_text",
  "notes":          "inquiry_text",
  "value":              "expected_value",
  "deal value":         "expected_value",
  "expected value":     "expected_value",
  "budget":             "expected_value",
  // import-inference fields
  "interest level":     "interest_level",
  "interest":           "interest_level",
  "intent":             "interest_level",
  "last contact":       "last_contact_days",
  "last contact days":  "last_contact_days",
  "days since contact": "last_contact_days",
  "last contacted":     "last_contact_days",
}

/**
 * POST /api/import/csv
 *
 * Processes the CSV inline (no Inngest dependency).
 * Reads, parses, deduplicates and scores all rows in the same request.
 * export const maxDuration = 300 gives 5 minutes — enough for 10 MB CSVs.
 *
 * Steps:
 * 1. Validate file
 * 2. Create ImportJobStatus (PROCESSING)
 * 3. Parse + process rows in batches of 50, updating progress after each batch
 * 4. Mark job COMPLETE and return { jobId }
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

    // ── Parse CSV ────────────────────────────────────────────────────────────
    const buffer  = Buffer.from(await file.arrayBuffer())
    const csvText = buffer.includes(0xFFFD)
      ? new TextDecoder("windows-1252").decode(buffer)
      : buffer.toString("utf-8")

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header:          true,
      skipEmptyLines:  true,
      transformHeader: (h) => COLUMN_MAP[h.toLowerCase().trim()] ?? h.toLowerCase().trim().replace(/\s+/g, "_"),
    })

    const rows      = parsed.data
    const totalRows = rows.length

    if (totalRows === 0) {
      return apiError("CSV file is empty or has no valid rows", "EMPTY_CSV", 422)
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

    // ── Process in batches of 50 ─────────────────────────────────────────────
    const BATCH_SIZE = 50
    let inserted   = 0
    let duplicates = 0
    let errors     = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)

      for (const row of batch) {
        try {
          const phone = normalisePhone(row.phone ?? row.mobile ?? row.contact ?? "")
          const firstName = (row.first_name ?? row.name ?? "").trim()

          if (!phone || !firstName) { errors++; continue }

          // Check for duplicate by phone within this account
          const exists = await prisma.lead.findUnique({
            where: { account_id_phone: { account_id: session.account.id, phone } },
          })
          if (exists) { duplicates++; continue }

          // Create lead + all import signals + compute scores — all in one transaction
          await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
              data: {
                account_id:     session.account.id,
                first_name:     firstName,
                last_name:      (row.last_name ?? "").trim() || null,
                phone,
                phone_raw:      row.phone ?? "",
                email:          (row.email ?? "").trim() || null,
                company_name:   (row.company_name ?? "").trim() || null,
                designation:    (row.designation ?? "").trim() || null,
                city:           (row.city ?? "").trim() || null,
                state:          (row.state ?? "").trim() || null,
                pincode:        (row.pincode ?? "").trim() || null,
                source_id:      sourceId,
                stage_id:       stageId,
                inquiry_text:   (row.inquiry_text ?? "").trim() || null,
                expected_value: row.expected_value
                  ? parseInt(row.expected_value.replace(/[^0-9]/g, ""), 10) || null
                  : null,
              },
            })

            // 1. SOURCE_BASELINE — always created; establishes intent floor
            await tx.signal.create({
              data: {
                account_id:           session.account.id,
                lead_id:              lead.id,
                signal_type:          "SOURCE_BASELINE",
                signal_value:         source.intent_baseline,
                raw_value:            { source_key: source.key, import_job_id: job.id },
                lead_grade_at_signal: "E",
                intent_score_before:  0,
                intent_score_after:   source.intent_baseline,
              },
            })

            // 2. Import-inference signals — generated from CSV fields
            const inferredSignals = generateImportSignals({
              interest_level:    row.interest_level ?? null,
              last_contact_days: row.last_contact_days
                ? parseInt(row.last_contact_days, 10) || null
                : null,
              notes: row.inquiry_text ?? row.notes ?? null,
            })

            if (inferredSignals.length > 0) {
              await tx.signal.createMany({
                data: inferredSignals.map((s) => ({
                  account_id:           session.account.id,
                  lead_id:              lead.id,
                  signal_type:          s.signal_type,
                  signal_value:         s.signal_value,
                  raw_value:            { source: "csv_import", import_job_id: job.id },
                  lead_grade_at_signal: "E",   // will be updated by processSignalAndUpdateScores
                  intent_score_before:  0,
                  intent_score_after:   0,
                })),
              })
            }

            // 3. Re-score the lead with all signals now in place
            await processSignalAndUpdateScores(lead.id, session.account.id, tx)
          })

          inserted++
        } catch (rowErr) {
          console.error("Row import error:", rowErr)
          errors++
        }
      }

      // Update progress after each batch
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
