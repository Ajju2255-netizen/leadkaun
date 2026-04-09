import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { computeNextBestAction } from "@/lib/scoring/nba"
import type { SignalRecord } from "@/lib/scoring/types"

/**
 * GET /api/queue
 * Returns the ranked priority queue for the current rep.
 *
 * Ranking formula (TAD 5.2):
 *   rank_score = (grade_weight × 40) + (intent_score × 0.35) + (fit_score × 0.25)
 *
 * Grade weights: A=100, B=80, C=70, D=50, E=30, F=0
 *
 * Exclusions:
 *   - is_junk = true
 *   - is_fatigued = true
 *   - won_at or lost_at set (terminal)
 *   - all follow-up actions snoozed (due_date > now)
 */

const GRADE_WEIGHT: Record<string, number> = {
  A: 100, B: 80, C: 70, D: 50, E: 30, F: 0,
}

export async function GET(req: Request) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "25"))

    // For ADMIN/MANAGER without a rep filter, return empty (they use the leads page)
    const repId =
      session.user.role === "REP"
        ? session.user.id
        : (searchParams.get("rep") ?? null)

    if (!repId) {
      return apiSuccess({ leads: [], total: 0 })
    }

    const now = new Date()

    const leads = await prisma.lead.findMany({
      where: {
        account_id:      session.account.id,
        assigned_rep_id: repId,
        is_junk:         false,
        is_fatigued:     false,
        won_at:          null,
        lost_at:         null,
        // Exclude snoozed: only include if at least one follow-up is due now
        // (or no follow-ups at all — new lead)
        OR: [
          {
            follow_up_actions: {
              some: { status: "PENDING", due_date: { lte: now } },
            },
          },
          {
            follow_up_actions: { none: {} },
          },
        ],
      },
      include: {
        source: { select: { id: true, name: true, key: true } },
        stage:  { select: { id: true, name: true, key: true } },
        signals: {
          orderBy: { created_at: "desc" },
          take: 10,
        },
        follow_up_actions: {
          where:   { status: { in: ["PENDING", "OVERDUE"] } },
          orderBy: { due_date: "asc" },
          take: 1,
        },
      },
    })

    // Compute rank score and NBA for each lead
    const ranked = leads
      .map((lead) => {
        const gradeWeight = GRADE_WEIGHT[lead.grade] ?? 0
        const rankScore =
          gradeWeight * 0.40 +
          lead.intent_score * 0.35 +
          lead.fit_score * 0.25

        const signals: SignalRecord[] = lead.signals.map((s) => ({
          signal_type:  s.signal_type,
          signal_value: s.signal_value,
          created_at:   s.created_at,
        }))

        const nba = computeNextBestAction(
          lead.grade,
          signals,
          !!lead.first_contact_at,
        )

        return { ...lead, rank_score: Math.round(rankScore), nba }
      })
      .sort((a, b) => b.rank_score - a.rank_score)
      .slice(0, limit)

    return apiSuccess({ leads: ranked, total: ranked.length })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
