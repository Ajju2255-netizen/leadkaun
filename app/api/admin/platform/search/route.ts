import { requirePlatformAdmin } from "@/lib/auth/platform"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { platformSearch } from "@/lib/admin/search"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

// GET /api/admin/platform/search?q= — cross-account search for Support.
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin()
    const q = new URL(req.url).searchParams.get("q") ?? ""
    return apiSuccess(await platformSearch(q))
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
