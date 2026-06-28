import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { processImportRows, MAX_BATCH_ROWS } from "@/lib/import/process-rows"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// One batch is small (the client sends ~10 rows), so this stays well under the
// function ceiling even on a slow DB.
export const maxDuration = 120

/**
 * POST /api/import/csv/batch
 *
 * Processes one batch of parsed CSV rows for an existing import job and
 * increments the job's running counters. Returns this batch's tallies so the
 * client can show real progress and accumulate the final summary.
 */
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace()
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
      return apiError("Only Admins and Managers can import leads", "FORBIDDEN", 403)
    }

    const limited = await rateLimited(`import:batch:${session.user.id}`, LIMITS.importBatch)
    if (limited) return limited

    const body          = await req.json().catch(() => ({}))
    const jobId         = body.jobId as string | undefined
    const sourceId      = body.source_id as string | undefined
    const stageId       = body.stage_id as string | undefined
    const rows          = body.rows as Record<string, string>[] | undefined
    const startRowIndex = Number(body.startRowIndex) || 2
    // Optional source-collection date for freshness (ISO string). Ignore if unparseable.
    const scRaw         = typeof body.source_collected_at === "string" ? new Date(body.source_collected_at) : null
    const sourceCollectedAt = scRaw && !isNaN(scRaw.getTime()) ? scRaw : null

    if (!jobId)               return apiError("jobId is required", "MISSING_JOB", 422)
    if (!sourceId)            return apiError("source_id is required", "MISSING_SOURCE", 422)
    if (!stageId)             return apiError("stage_id is required", "MISSING_STAGE", 422)
    if (!Array.isArray(rows)) return apiError("rows must be an array", "BAD_ROWS", 422)
    if (rows.length > MAX_BATCH_ROWS) {
      return apiError(`Too many rows in one batch (max ${MAX_BATCH_ROWS}).`, "BATCH_TOO_LARGE", 422)
    }

    // Job + source + stage must all belong to the caller's account.
    const [job, source, stage] = await Promise.all([
      prisma.importJobStatus.findFirst({ where: { id: jobId, account_id: session.account.id, workspace_id: session.workspace.id }, select: { id: true } }),
      prisma.leadSource.findFirst({ where: { id: sourceId, account_id: session.account.id, workspace_id: session.workspace.id } }),
      prisma.pipelineStage.findFirst({ where: { id: stageId, account_id: session.account.id, workspace_id: session.workspace.id } }),
    ])
    if (!job)    return apiError("Import job not found", "NOT_FOUND", 404)
    if (!source) return apiError("Lead source not found", "NOT_FOUND", 404)
    if (!stage)  return apiError("Pipeline stage not found", "NOT_FOUND", 404)

    const result = await processImportRows({
      rows,
      startRowIndex,
      accountId: session.account.id,
      workspaceId: session.workspace.id,
      sourceId,
      stageId,
      jobId,
      source: { key: source.key, intent_baseline: source.intent_baseline },
      sourceCollectedAt,
    })

    // Accumulate counters on the job (history + any pollers stay accurate).
    await prisma.importJobStatus.update({
      where: { id: jobId },
      data: {
        inserted:          { increment: result.inserted },
        duplicates:        { increment: result.duplicates },
        errors:            { increment: result.errors },
        high_intent_count: { increment: result.highIntentCount },
        total_value:       { increment: result.totalValue },
      },
    })

    return apiSuccess(result)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("CSV import batch error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
