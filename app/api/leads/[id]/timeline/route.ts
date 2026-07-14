import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, NOT_FOUND } from "@/lib/api/response"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

type Params = { params: { id: string } }

/**
 * GET /api/leads/[id]/timeline
 * The Score Evolution timeline — every grade/confidence snapshot for this lead,
 * oldest first (reads as a story). REP sees only their own leads.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace()

    const lead = await prisma.lead.findFirst({
      where: {
        id: params.id,
        account_id: session.account.id, workspace_id: session.workspace.id,
        ...(session.user.role === "REP" ? { assigned_rep_id: session.user.id } : {}),
      },
      select: { id: true },
    })
    if (!lead) return NOT_FOUND("Lead")

    const events = await prisma.leadScoreEvent.findMany({
      where:   { lead_id: params.id },
      orderBy: { occurred_at: "asc" },
      select: {
        id: true, kind: true, occurred_at: true, summary: true,
        grade: true, confidence: true, fit_score: true, intent_score: true, quality_score: true,
      },
      take: 200,
    })

    return apiSuccess({ events })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
