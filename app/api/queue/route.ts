import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { getNextAction, buildActionReason } from "@/lib/scoring/next-action"
import type { SignalType } from "@prisma/client"

const OUTREACH_SIGNAL_TYPES: SignalType[] = [
  "CALL_ANSWERED_INTERESTED",
  "CALL_ANSWERED_NOT_INTERESTED",
  "CALL_ANSWERED_CALLBACK",
  "CALL_ANSWERED_WRONG_NUMBER",
  "CALL_NOT_ANSWERED",
  "CALL_BUSY",
  "CALL_INVALID",
  "CALL_VOICEMAIL",
]

// Signals that indicate the lead is actively engaged / interested
const HOT_SIGNAL_TYPES: SignalType[] = [
  "CALL_ANSWERED_INTERESTED",
  "CALL_ANSWERED_CALLBACK",
  "WA_REPLIED_1H",
  "WA_REPLIED_4H",
  "WA_REPLIED_24H",
  "WA_TAG_ASKED_PRICING",
  "WA_TAG_NEGOTIATING",
  "WA_TAG_DECISION_PENDING",
]

const HOT_WINDOW_MS = 2 * 3_600_000 // 2 hours

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
        is_missed:  false,
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
        signals: {
          orderBy: { created_at: "desc" },
          take:    3,
          select:  { signal_type: true, created_at: true },
        },
      },
    })

    // Attach next_action + signal intelligence to each lead
    const now = Date.now()
    const enriched = leads.map((lead) => {
      const latestSignal    = lead.signals[0] ?? null
      const latestSignalMs  = latestSignal ? new Date(latestSignal.created_at).getTime() : null
      const msSinceSignal   = latestSignalMs != null ? now - latestSignalMs : null
      const isHotSignal     = latestSignal != null
        && HOT_SIGNAL_TYPES.includes(latestSignal.signal_type as SignalType)
        && msSinceSignal != null
        && msSinceSignal < HOT_WINDOW_MS

      return {
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
        hours_since_import:       lead.imported_at
          ? Math.floor((now - new Date(lead.imported_at).getTime()) / 3_600_000)
          : null,
        last_signal_at:           latestSignal?.created_at ?? null,
        last_signal_type:         latestSignal?.signal_type ?? null,
        minutes_since_last_signal: msSinceSignal != null
          ? Math.floor(msSinceSignal / 60_000)
          : null,
        is_hot_signal:            isHotSignal,
      }
    })

    // Count outreach signals logged today (any call attempt = "contacted")
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const contactedToday = await prisma.signal.count({
      where: {
        account_id:  session.account.id,
        created_at:  { gte: todayStart },
        signal_type: { in: OUTREACH_SIGNAL_TYPES },
        ...(session.user.role === "REP" ? { user_id: session.user.id } : {}),
      },
    })

    // Group by grade — hot-signal leads bubble to top within each group
    const grouped: Record<string, typeof enriched> = { A: [], B: [], C: [], D: [], E: [] }
    for (const lead of enriched) {
      if (grouped[lead.grade]) grouped[lead.grade].push(lead)
    }
    for (const g of Object.keys(grouped)) {
      grouped[g].sort((a, b) => {
        if (a.is_hot_signal && !b.is_hot_signal) return -1
        if (!a.is_hot_signal && b.is_hot_signal) return 1
        return 0
      })
    }

    // Summary stats per group
    const summary = Object.entries(grouped).map(([grade, items]) => ({
      grade,
      count:      items.length,
      total_value: items.reduce((s, l) => s + (l.expected_value ?? 0), 0),
      action:     getNextAction(grade),
    }))

    return apiSuccess({
      leads:          enriched,
      grouped,
      summary,
      total:          enriched.length,
      contacted_today: contactedToday,
    })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
