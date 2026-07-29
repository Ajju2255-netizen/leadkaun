import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { startOfIstDay } from "@/lib/time/ist"
import { RecommendationSkipReason } from "@prisma/client"

// Reads the session cookie, so this route is always dynamic.
export const dynamic = "force-dynamic"

const SKIP_LABELS: Record<RecommendationSkipReason, string> = {
  ALREADY_DOING_IT: "Already doing it",
  WRONG_RECOMMENDATION: "Wrong recommendation",
  NEED_MORE_INFO: "Need more information",
  NOT_RELEVANT: "Not relevant",
  OTHER: "Other",
}

/** One-decimal percentage, or null when there's no denominator yet. */
function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null
}

/**
 * GET /api/analytics/recommendations?days=30
 *
 * The recommendation-interaction funnel and the north-star metric:
 *   RAR (Recommendation Acceptance Rate) = ACCEPTED / SHOWN
 *
 * Also returns the EXPANDED rate (how often reps open the "why" before acting —
 * the clearest read on trust) and the skip-reason breakdown (where
 * recommendations fail). RSR (success / accepted) follows once EXECUTED/OUTCOME
 * are wired. Admin/Manager only.
 */
export async function GET(req: Request) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")
    const account_id = session.account.id
    const workspace_id = session.workspace.id

    const { searchParams } = new URL(req.url)
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10) || 30))
    const windowStart = startOfIstDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000))

    const where = { account_id, workspace_id, created_at: { gte: windowStart } }

    const [byEvent, bySkip] = await Promise.all([
      prisma.recommendationEvent.groupBy({
        by: ["event"],
        where,
        _count: { _all: true },
      }),
      prisma.recommendationEvent.groupBy({
        by: ["skip_reason"],
        where: { ...where, event: "IGNORED" },
        _count: { _all: true },
      }),
    ])

    const count = (e: string) => byEvent.find((r) => r.event === e)?._count._all ?? 0
    const counts = {
      shown:     count("SHOWN"),
      expanded:  count("EXPANDED"),
      accepted:  count("ACCEPTED"),
      ignored:   count("IGNORED"),
      dismissed: count("DISMISSED"),
      executed:  count("EXECUTED"),
      outcome:   count("OUTCOME"),
    }

    const decided = counts.accepted + counts.ignored

    const skip_reasons = (Object.keys(SKIP_LABELS) as RecommendationSkipReason[])
      .map((key) => {
        const c = bySkip.find((r) => r.skip_reason === key)?._count._all ?? 0
        return { reason: key, label: SKIP_LABELS[key], count: c, pct: pct(c, counts.ignored) }
      })
      .sort((a, b) => b.count - a.count)

    return apiSuccess({
      window_days: days,
      counts,
      // North-star metric — null until at least one recommendation is shown.
      rar: pct(counts.accepted, counts.shown),          // ACCEPTED / SHOWN
      expand_rate: pct(counts.expanded, counts.shown),  // trust signal
      // Of the reps who actually decided, how many followed us.
      accept_rate_of_decided: pct(counts.accepted, decided),
      skip_reasons,
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
