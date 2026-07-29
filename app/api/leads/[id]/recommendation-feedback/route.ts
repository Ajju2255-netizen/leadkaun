import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { RecommendationEventType, RecommendationSkipReason } from "@prisma/client"

// Reads the session cookie → always dynamic (opt out of static prerender).
export const dynamic = "force-dynamic"

const EVENTS = new Set<string>(Object.values(RecommendationEventType))
const SKIP_REASONS = new Set<string>(Object.values(RecommendationSkipReason))
const BANDS = new Set(["high", "moderate", "low", "very_low"])

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
}

/**
 * POST /api/leads/[id]/recommendation-feedback
 * Logs one step of the recommendation-interaction funnel (SHOWN, EXPANDED,
 * ACCEPTED, IGNORED, …). This is the raw dataset behind RAR / RSR. Fire-and-
 * forget from the client — best-effort, never blocks the UI.
 *
 * Body: { event, action_label?, grade_at_event?, confidence_band?, skip_reason? }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`reco-fb:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl

    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const event = typeof body?.event === "string" ? body.event.toUpperCase() : ""
    if (!EVENTS.has(event)) {
      return apiError("Unknown recommendation event", "BAD_REQUEST", 400)
    }

    // Tenant guard: only log against a lead in this workspace.
    const lead = await prisma.lead.findFirst({
      where: { id, account_id: session.account.id, workspace_id: session.workspace.id },
      select: { id: true },
    })
    if (!lead) return apiError("Lead not found", "NOT_FOUND", 404)

    // skip_reason only makes sense on IGNORED; ignore it otherwise.
    const rawReason = typeof body?.skip_reason === "string" ? body.skip_reason.toUpperCase() : ""
    const skipReason =
      event === RecommendationEventType.IGNORED && SKIP_REASONS.has(rawReason)
        ? (rawReason as RecommendationSkipReason)
        : null

    const band = str(body?.confidence_band, 16)

    await prisma.recommendationEvent.create({
      data: {
        account_id:      session.account.id,
        workspace_id:    session.workspace.id,
        lead_id:         id,
        user_id:         session.user.id,
        event:           event as RecommendationEventType,
        action_label:    str(body?.action_label, 80),
        grade_at_event:  str(body?.grade_at_event, 2),
        confidence_band: band && BANDS.has(band) ? band : null,
        skip_reason:     skipReason,
      },
    })

    return apiSuccess({ logged: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
