import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * POST /api/settings/onboarding-complete
 * Marks ICP as configured (used as onboarding completion signal).
 * Only called once during the onboarding flow — safe to call multiple times.
 */
export async function POST() {
  try {
    const session = await requireAuth()

    const _rl = await rateLimited(`onboarding:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl

    await prisma.account.update({
      where: { id: session.account.id },
      data:  { icp_configured: true },
    })

    return apiSuccess({ ok: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
