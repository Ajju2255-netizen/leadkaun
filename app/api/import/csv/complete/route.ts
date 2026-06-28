import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { MAX_STORED_ERRORS } from "@/lib/import/process-rows"
import { recordAccountEvent } from "@/lib/events/account-events"

/**
 * POST /api/import/csv/complete
 *
 * Finalises a batched import: flips the job to COMPLETE and stores the
 * accumulated error detail. No account-wide re-grade sweep — imported leads are
 * already scored by the orchestrator during insert, so the old per-import sweep
 * of every Grade-E lead was redundant and is intentionally not run here.
 */
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`import:complete:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl

    const body         = await req.json().catch(() => ({}))
    const jobId        = body.jobId as string | undefined
    const errorReasons = Array.isArray(body.errorReasons) ? (body.errorReasons as string[]) : []
    const totalErrors  = typeof body.totalErrors === "number" ? body.totalErrors : null
    // The client sets this when a batch failed and the stream stopped early.
    // Such a job is partial, not COMPLETE — record it honestly so history
    // doesn't show a green "Complete" for an import that didn't finish.
    const aborted      = body.aborted === true

    if (!jobId) return apiError("jobId is required", "MISSING_JOB", 422)

    const job = await prisma.importJobStatus.findFirst({
      where:  { id: jobId, account_id: session.account.id, workspace_id: session.workspace.id },
      select: { id: true, errors: true },
    })
    if (!job) return apiError("Import job not found", "NOT_FOUND", 404)

    const reasons  = errorReasons.slice(0, MAX_STORED_ERRORS)
    const errCount = totalErrors ?? job.errors

    const updated = await prisma.importJobStatus.update({
      where: { id: jobId },
      data: {
        status:       aborted ? "FAILED" : "COMPLETE",
        progress_pct: 100,
        completed_at: new Date(),
        ...(reasons.length > 0 && {
          error_detail: {
            total_errors: errCount,
            shown:        reasons.length,
            truncated:    errCount > reasons.length,
            rows:         reasons,
          },
        }),
      },
    })

    await recordAccountEvent({
      accountId: session.account.id,
      workspaceId: session.workspace.id,
      actorUserId: session.user.id,
      type: aborted ? "IMPORT_FAILED" : "IMPORT_COMPLETED",
      summary: aborted
        ? `Import did not finish (${errCount} errors)`
        : `Imported ${updated.inserted} leads${updated.duplicates ? `, ${updated.duplicates} duplicates` : ""}`,
      detail: { inserted: updated.inserted, duplicates: updated.duplicates, errors: errCount, fileName: updated.file_name },
    })

    return apiSuccess(updated)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("CSV import complete error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
