import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { inngest } from "@/inngest/client"
import { randomUUID } from "crypto"

// Max CSV file size: 10 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * POST /api/import/csv
 *
 * Accepts a multipart/form-data upload with:
 *   - file:      CSV file (required)
 *   - source_id: LeadSource id (required)
 *   - stage_id:  PipelineStage id (required)
 *
 * Steps:
 * 1. Validate file size and MIME type
 * 2. Upload raw CSV to Supabase Storage (bucket: csv-imports)
 * 3. Create ImportJobStatus record (PENDING)
 * 4. Fire import/csv.uploaded Inngest event
 * 5. Return { jobId } — client polls /api/import/status/[jobId]
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

    if (!file) return apiError("No file provided", "MISSING_FILE", 422)
    if (!sourceId) return apiError("source_id is required", "MISSING_SOURCE", 422)
    if (!stageId)  return apiError("stage_id is required", "MISSING_STAGE", 422)

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith(".csv") && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      return apiError("Only CSV files are supported", "INVALID_FILE_TYPE", 422)
    }

    // Validate file size
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

    // Upload to Supabase Storage
    const admin      = createSupabaseAdminClient()
    const bucketPath = `${session.account.id}/${randomUUID()}.csv`
    const buffer     = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await admin.storage
      .from("csv-imports")
      .upload(bucketPath, buffer, { contentType: "text/csv", upsert: false })

    if (uploadError) {
      return apiError(`Storage upload failed: ${uploadError.message}`, "STORAGE_ERROR", 500)
    }

    // Create import job record (source_id and stage_id travel with the Inngest event)
    const job = await prisma.importJobStatus.create({
      data: {
        account_id:   session.account.id,
        user_id:      session.user.id,
        status:       "PENDING",
        progress_pct: 0,
        inserted:     0,
        duplicates:   0,
        errors:       0,
      },
    })

    // Fire Inngest event
    await inngest.send({
      name: "import/csv.uploaded",
      data: {
        job_id:      job.id,
        account_id:  session.account.id,
        user_id:     session.user.id,
        source_id:   sourceId,
        stage_id:    stageId,
        bucket_path: bucketPath,
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
