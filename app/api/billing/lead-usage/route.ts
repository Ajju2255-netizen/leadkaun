import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { getLeadUsage } from "@/lib/billing/lead-usage"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/billing/lead-usage
 * Lightweight active-lead usage for the in-app soft-paywall banner (polled on
 * the dashboard). Any authenticated role — the banner is informational; the
 * upgrade CTA points at Settings → Billing, which is admin-gated.
 */
export async function GET() {
  try {
    const session = await requireAuth()
    return apiSuccess(await getLeadUsage(session.account.id))
  } catch (err) {
    return handleAuthError(err) ?? apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
