import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { analyseIntake } from "@/lib/intake/analyse"

// Reads the session cookie → always dynamic.
export const dynamic = "force-dynamic"

// Cap the sample the engine profiles. The client parses in the browser and
// sends a representative slice; a bigger sample doesn't materially change the
// profile but does cost payload + time.
const MAX_SAMPLE = 2000

/**
 * POST /api/import/analyse
 *
 * The "Analysing…" step. Takes a parsed, column-mapped sample of rows and
 * returns the Import Intelligence Report. Imports NOTHING — no lead is written,
 * no job created. Admin/Manager only.
 *
 * Body: { sample: Record<string,string>[], total_rows?: number }
 */
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")

    const rl = await rateLimited(`intake:${session.user.id}`, LIMITS.write)
    if (rl) return rl

    const body = await req.json().catch(() => ({}))
    const rawSample = Array.isArray(body?.sample) ? body.sample : null
    if (!rawSample || rawSample.length === 0) {
      return apiError("No rows to analyse", "BAD_REQUEST", 400)
    }

    // Only keep plain string-keyed objects; drop anything malformed.
    const sample = rawSample
      .filter((r: unknown): r is Record<string, string> => !!r && typeof r === "object" && !Array.isArray(r))
      .slice(0, MAX_SAMPLE)

    const totalRows = Number.isFinite(body?.total_rows)
      ? Math.max(0, Math.floor(body.total_rows))
      : sample.length

    const report = analyseIntake({ sample, totalRows })
    return apiSuccess(report)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
