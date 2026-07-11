import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { getLeadUsage } from "@/lib/billing/lead-usage"

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
