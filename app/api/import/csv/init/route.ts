import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { MAX_IMPORT_ROWS } from "@/lib/import/process-rows"
import { getLeadUsage } from "@/lib/billing/lead-usage"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * POST /api/import/csv/init
 *
 * Starts a batched CSV import: validates source + stage, creates the job
 * record (PROCESSING) and returns its id. The client then streams the parsed
 * rows through /api/import/csv/batch and finishes with /api/import/csv/complete.
 * Keeps every request short so large imports never block or hit the function
 * ceiling (the old one-shot route processed the whole file inline).
 */
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace()
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
      return apiError("Only Admins and Managers can import leads", "FORBIDDEN", 403)
    }

    const limited = await rateLimited(`import:init:${session.account.id}`, LIMITS.importInit)
    if (limited) return limited

    const body       = await req.json().catch(() => ({}))
    const sourceId   = body.source_id as string | undefined
    const stageId    = body.stage_id as string | undefined
    const totalRows  = Number(body.total_rows)
    const fileName   = (body.file_name as string | undefined) || "import.csv"
    const nameParam  = (body.name as string | undefined)?.trim() || null

    if (!sourceId)            return apiError("source_id is required", "MISSING_SOURCE", 422)
    if (!stageId)             return apiError("stage_id is required", "MISSING_STAGE", 422)
    if (!totalRows || totalRows < 1) return apiError("CSV has no rows to import", "EMPTY_CSV", 422)
    if (totalRows > MAX_IMPORT_ROWS) {
      return apiError(`That file has ${totalRows.toLocaleString("en-IN")} rows — the limit is ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} per import. Split it into smaller files.`, "IMPORT_TOO_LARGE", 422)
    }

    // Active-lead cap. Reject up front if already at the limit; the batch route
    // enforces the exact ceiling as rows stream in. Existing leads stay usable —
    // only new imports are blocked until some leads are closed or the plan grows.
    const usage = await getLeadUsage(session.account.id)
    if (usage.isOver) {
      return apiError(
        `Your ${usage.planName} workspace has reached its limit of ${usage.limit?.toLocaleString("en-IN")} active leads. Close or remove some, or upgrade, to import more.`,
        "LEAD_LIMIT_REACHED",
        403,
      )
    }

    const [source, stage] = await Promise.all([
      prisma.leadSource.findFirst({ where: { id: sourceId, account_id: session.account.id, workspace_id: session.workspace.id } }),
      prisma.pipelineStage.findFirst({ where: { id: stageId, account_id: session.account.id, workspace_id: session.workspace.id } }),
    ])
    if (!source) return apiError("Lead source not found", "NOT_FOUND", 404)
    if (!stage)  return apiError("Pipeline stage not found", "NOT_FOUND", 404)

    const dateStr = new Date().toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    })
    const sessionName = nameParam ?? `Import · ${dateStr} · ${source.name}`

    const job = await prisma.importJobStatus.create({
      data: {
        account_id:   session.account.id,
        workspace_id: session.workspace.id,
        user_id:      session.user.id,
        status:       "PROCESSING",
        total_rows:   totalRows,
        progress_pct: 0,
        inserted:     0,
        duplicates:   0,
        errors:       0,
        name:         sessionName,
        file_name:    fileName,
        source_id:    sourceId,
      },
    })

    return apiSuccess({ jobId: job.id, sessionName }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("CSV import init error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
