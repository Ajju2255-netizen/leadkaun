import { inngest } from "@/inngest/client"
import { prisma } from "@/lib/prisma"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"
import Papa from "papaparse"

const BATCH_SIZE = 500  // PostgreSQL 65,535 param limit: 500 rows × ~30 fields = ~15,000

// Column name aliases — maps common CSV headers to our field names
const COLUMN_MAP: Record<string, string> = {
  "first name":     "first_name",
  "firstname":      "first_name",
  "name":           "first_name",
  "last name":      "last_name",
  "lastname":       "last_name",
  "surname":        "last_name",
  "mobile":         "phone",
  "phone":          "phone",
  "phone number":   "phone",
  "mobile number":  "phone",
  "contact":        "phone",
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
  "inquiry":        "inquiry_text",
  "message":        "inquiry_text",
  "remarks":        "inquiry_text",
  "notes":          "inquiry_text",
  "value":          "expected_value",
  "deal value":     "expected_value",
  "expected value": "expected_value",
}

export type CsvUploadedEvent = {
  data: {
    job_id:      string
    account_id:  string
    user_id:     string
    source_id:   string
    stage_id:    string
    bucket_path: string   // Supabase Storage path to the uploaded CSV
  }
}

/**
 * CSV import job.
 * Triggered by: import/csv.uploaded
 *
 * Steps:
 * 1. Download CSV from Supabase Storage
 * 2. Parse + validate rows in BATCH_SIZE chunks
 * 3. Upsert each batch (dedup by phone within account)
 * 4. Run scoring pipeline for each new lead
 * 5. Update ImportJobStatus progress
 * 6. Fire import/completed event on finish
 * 7. Delete file from storage
 *
 * TAD ref: Section 6.3
 */
export const csvImportFn = inngest.createFunction(
  {
    id:          "csv-import",
    name:        "CSV Import Pipeline",
    concurrency: { limit: 5 },             // max 5 concurrent imports per deployment
    retries:     2,
    triggers:    [{ event: "import/csv.uploaded" }],
  },
  async ({ event, step, logger }) => {
    const { job_id, account_id, user_id, source_id, stage_id, bucket_path } =
      (event as unknown as CsvUploadedEvent).data

    // ── 1. Mark job as processing ────────────────────────────────────────────
    await step.run("mark-processing", async () => {
      await prisma.importJobStatus.update({
        where: { id: job_id },
        data: { status: "PROCESSING", progress_pct: 0 },
      })
    })

    // ── 2. Download CSV from Supabase Storage ────────────────────────────────
    const csvText = await step.run("download-csv", async () => {
      const admin = createSupabaseAdminClient()
      const { data, error } = await admin.storage
        .from("csv-imports")
        .download(bucket_path)
      if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)

      // Detect encoding: try UTF-8 first; fall back to Windows-1252 (latin1)
      // if the text contains replacement characters (U+FFFD) indicating bad UTF-8 decode.
      const buffer = await data.arrayBuffer()
      const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer)
      if (utf8Text.includes("\uFFFD")) {
        // Contains invalid UTF-8 sequences → likely Windows-1252
        return new TextDecoder("windows-1252").decode(buffer)
      }
      return utf8Text
    })

    // ── 3. Parse CSV ─────────────────────────────────────────────────────────
    const { rows, totalRows } = await step.run("parse-csv", async () => {
      const result = Papa.parse<Record<string, string>>(csvText, {
        header:         true,
        skipEmptyLines: true,
        transformHeader: (h) => {
          const mapped = COLUMN_MAP[h.toLowerCase().trim()]
          return mapped ?? h.toLowerCase().trim().replace(/\s+/g, "_")
        },
      })
      return { rows: result.data, totalRows: result.data.length }
    })

    await step.run("update-total", async () => {
      await prisma.importJobStatus.update({
        where: { id: job_id },
        data: { total_rows: totalRows },
      })
    })

    logger.info(`CSV import: ${totalRows} rows to process`)

    // ── 4. Get source for baseline ───────────────────────────────────────────
    const source = await step.run("load-source", async () => {
      return prisma.leadSource.findUniqueOrThrow({ where: { id: source_id } })
    })

    // ── 5. Process in batches ────────────────────────────────────────────────
    const batches = Math.ceil(totalRows / BATCH_SIZE)
    let inserted  = 0
    let duplicates = 0
    let errors    = 0

    for (let i = 0; i < batches; i++) {
      const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)

      const batchResult = await step.run(`import-batch-${i}`, async () => {
        let batchInserted  = 0
        let batchDuplicates = 0
        let batchErrors    = 0

        for (const row of batch) {
          try {
            const phone = normalisePhone(row.phone ?? "")
            if (!phone || !row.first_name) { batchErrors++; continue }

            // Check for duplicate
            const exists = await prisma.lead.findUnique({
              where: { account_id_phone: { account_id, phone } },
            })
            if (exists) { batchDuplicates++; continue }

            // Create lead + signal + score in transaction
            await prisma.$transaction(async (tx) => {
              const lead = await tx.lead.create({
                data: {
                  account_id,
                  first_name:     row.first_name?.trim() ?? "Unknown",
                  last_name:      row.last_name?.trim() || null,
                  phone,
                  phone_raw:      row.phone ?? "",
                  email:          row.email?.trim() || null,
                  company_name:   row.company_name?.trim() || null,
                  designation:    row.designation?.trim() || null,
                  city:           row.city?.trim() || null,
                  state:          row.state?.trim() || null,
                  pincode:        row.pincode?.trim() || null,
                  source_id,
                  stage_id,
                  inquiry_text:   row.inquiry_text?.trim() || null,
                  expected_value: row.expected_value
                    ? parseInt(row.expected_value.replace(/[^0-9]/g, ""), 10) || null
                    : null,
                },
              })

              await tx.signal.create({
                data: {
                  account_id,
                  lead_id:              lead.id,
                  signal_type:          "SOURCE_BASELINE",
                  signal_value:         source.intent_baseline,
                  raw_value:            { source_key: source.key, import_job_id: job_id },
                  lead_grade_at_signal: "E",
                  intent_score_before:  0,
                  intent_score_after:   source.intent_baseline,
                },
              })

              await processSignalAndUpdateScores(lead.id, account_id, tx)
            })

            batchInserted++
          } catch (err) {
            logger.error(`Row error: ${err}`)
            batchErrors++
          }
        }

        return { batchInserted, batchDuplicates, batchErrors }
      })

      inserted   += batchResult.batchInserted
      duplicates += batchResult.batchDuplicates
      errors     += batchResult.batchErrors

      // Update progress after each batch
      await step.run(`update-progress-${i}`, async () => {
        const pct = Math.round(((i + 1) / batches) * 95)  // cap at 95 until finalized
        await prisma.importJobStatus.update({
          where: { id: job_id },
          data: { inserted, duplicates, errors, progress_pct: pct },
        })
      })
    }

    // ── 6. Mark complete ─────────────────────────────────────────────────────
    await step.run("mark-complete", async () => {
      await prisma.importJobStatus.update({
        where: { id: job_id },
        data: {
          status:       "COMPLETE",
          inserted,
          duplicates,
          errors,
          progress_pct: 100,
          completed_at: new Date(),
        },
      })
    })

    // ── 7. Delete file from storage (cleanup) ────────────────────────────────
    await step.run("cleanup-storage", async () => {
      const admin = createSupabaseAdminClient()
      await admin.storage.from("csv-imports").remove([bucket_path])
    })

    // ── 8. Fire completed event ──────────────────────────────────────────────
    await step.sendEvent("fire-completed", {
      name: "import/completed",
      data: { job_id, account_id, user_id, inserted, duplicates, errors },
    })

    logger.info(`CSV import complete: ${inserted} inserted, ${duplicates} duplicates, ${errors} errors`)
    return { job_id, inserted, duplicates, errors }
  },
)

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`
  if (digits.length === 10) return `+91${digits}`
  if (digits.length > 10) return `+${digits}`
  return ""  // too short to be valid
}
