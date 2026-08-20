import { prisma } from "@/lib/prisma"
import { recordAccountEvent } from "@/lib/events/account-events"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * POST /api/settings/onboarding-complete
 * Marks the onboarding wizard as finished. Safe to call more than once.
 *
 * This used to set `icp_configured: true`, which conflated three different
 * things and made activation impossible to measure — an account that skipped
 * the ICP step still looked configured. They are now distinct:
 *
 *   onboarding_completed_at — the user finished the wizard (set here)
 *   icp_configured          — an ICP was actually saved (set by /api/settings/icp)
 *   activated               — derived: an IMPORT_COMPLETED event exists
 */
export async function POST() {
  try {
    const session = await requireAuth()

    const _rl = await rateLimited(`onboarding:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl

    await prisma.account.update({
      where: { id: session.account.id },
      data:  { onboarding_completed_at: new Date() },
    })

    // The column alone was invisible to the AccountEvent funnel, so the step
    // between onboarding_started and import_started could not be read.
    await recordAccountEvent({
      accountId: session.account.id,
      actorUserId: session.user.id,
      type: "ONBOARDING_COMPLETED",
      summary: "Finished onboarding",
    })

    return apiSuccess({ ok: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
