import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { getNextAction, buildActionReason } from "@/lib/scoring/next-action"

/**
 * GET /api/queue
 *
 * Returns active leads grouped and sorted for the priority queue view.
 *
 * - REP: only their assigned leads
 * - ADMIN / MANAGER: all account leads (or ?rep= filter for a specific rep)
 *
 * Within each grade group, leads are sorted by expected_value DESC so the
 * highest-value opportunity surfaces first.
 *
 * Exclusions: junk, won, lost, fatigued.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)

    // Rep filter: REP always sees only their leads; admin can optionally filter
    const repFilter =
      session.user.role === "REP"
        ? { assigned_rep_id: session.user.id }
        : searchParams.get("rep")
        ? { assigned_rep_id: searchParams.get("rep")! }
        : {}   // admin/manager with no rep filter → all account leads

    const leads = await prisma.lead.findMany({
      where: {
        account_id: session.account.id,
        is_junk:    false,
        is_fatigued: false,
        won_at:     null,
        lost_at:    null,
        ...repFilter,
      },
      orderBy: [
        { grade:          "asc"  },  // A first
        { expected_value: "desc" },  // highest value within grade
        { imported_at:    "desc" },
      ],
      take: 200,
      include: {
        source: { select: { id: true, name: true, key: true } },
        stage:  { select: { id: true, name: true, key: true } },
        assigned_rep: { select: { id: true, first_name: true, last_name: true } },
        follow_up_actions: {
          where:   { status: { in: ["PENDING", "OVERDUE"] } },
          orderBy: { due_date: "asc" },
          take: 1,
        },
      },
    })

    // Attach next_action with smart reason to each lead
    const enriched = leads.map((lead) => ({
      ...lead,
      next_action: {
        ...getNextAction(lead.grade),
        reason: buildActionReason({
          grade:         lead.grade,
          fit_score:     lead.fit_score,
          intent_score:  lead.intent_score,
          quality_score: lead.quality_score,
          inquiry_text:  lead.inquiry_text,
        }),
      },
    }))

    // Group by grade
    const grouped: Record<string, typeof enriched> = { A: [], B: [], C: [], D: [], E: [] }
    for (const lead of enriched) {
      if (grouped[lead.grade]) grouped[lead.grade].push(lead)
    }

    // Summary stats per group
    const summary = Object.entries(grouped).map(([grade, items]) => ({
      grade,
      count:      items.length,
      total_value: items.reduce((s, l) => s + (l.expected_value ?? 0), 0),
      action:     getNextAction(grade),
    }))

    return apiSuccess({
      leads:   enriched,
      grouped,
      summary,
      total:   enriched.length,
    })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
