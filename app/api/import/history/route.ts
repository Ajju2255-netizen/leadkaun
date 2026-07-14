import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/import/history
 *
 * Returns the last 50 import jobs for the current account, most recent first.
 * Includes session identity fields (name, file_name, source name)
 * and post-import insight counts (high_intent_count, total_value).
 */
export async function GET() {
  try {
    const session = await requireWorkspace()

    const jobs = await prisma.importJobStatus.findMany({
      where:   { account_id: session.account.id, workspace_id: session.workspace.id },
      orderBy: { created_at: "desc" },
      take:    50,
      select: {
        id:                true,
        status:            true,
        name:              true,
        file_name:         true,
        source_id:         true,
        total_rows:        true,
        inserted:          true,
        duplicates:        true,
        errors:            true,
        progress_pct:      true,
        high_intent_count: true,
        total_value:       true,
        error_detail:      true,
        created_at:        true,
        completed_at:      true,
      },
    })

    // Attach source names in one query
    const sourceIds = Array.from(new Set(jobs.map((j) => j.source_id).filter(Boolean))) as string[]
    const sources   = sourceIds.length
      ? await prisma.leadSource.findMany({
          where:  { id: { in: sourceIds }, account_id: session.account.id, workspace_id: session.workspace.id },
          select: { id: true, name: true },
        })
      : []
    const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s.name]))

    const enriched = jobs.map((j) => ({
      ...j,
      source_name: j.source_id ? (sourceMap[j.source_id] ?? null) : null,
    }))

    return apiSuccess({ jobs: enriched })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
