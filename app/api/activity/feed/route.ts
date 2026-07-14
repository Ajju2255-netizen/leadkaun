import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { SIGNAL_LABELS, signalLabel, type SignalCategory } from "@/lib/activity/signal-labels"
import type { Prisma, LeadGrade, SignalType } from "@prisma/client"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/activity/feed
 *
 * Paginated team activity feed (the Signal log, which records WHO did WHAT to
 * WHICH lead and WHEN). Filters: rep_id, category, grade, from/to. A REP only
 * ever sees their own activity; ADMIN/MANAGER see the whole team (+ optional
 * rep_id filter).
 */

const PAGE_SIZE = 30

function signalTypesForCategory(cat: SignalCategory): SignalType[] {
  return Object.entries(SIGNAL_LABELS)
    .filter(([, v]) => v.category === cat)
    .map(([k]) => k) as SignalType[]
}

export async function GET(req: Request) {
  try {
    const session = await requireWorkspace()
    const { searchParams } = new URL(req.url)

    const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
    const repParam = searchParams.get("rep_id") || undefined
    const category = (searchParams.get("category") || undefined) as SignalCategory | undefined
    const grade    = (searchParams.get("grade") || undefined) as LeadGrade | undefined
    const from     = searchParams.get("from")
    const to       = searchParams.get("to")

    // REP sees only their own activity; managers/admins see all (optionally one rep).
    const userFilter =
      session.user.role === "REP"
        ? { user_id: session.user.id }
        : repParam
        ? { user_id: repParam }
        : {}

    const where: Prisma.SignalWhereInput = {
      account_id: session.account.id, workspace_id: session.workspace.id,
      ...userFilter,
      ...(category ? { signal_type: { in: signalTypesForCategory(category) } } : {}),
      ...(grade ? { lead: { grade } } : {}),
      ...((from || to) ? {
        created_at: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.signal.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, signal_type: true, signal_value: true, created_at: true,
          lead: { select: { id: true, first_name: true, last_name: true, company_name: true, grade: true } },
          user: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      prisma.signal.count({ where }),
    ])

    const items = rows.map((s) => {
      const { label, category } = signalLabel(s.signal_type)
      const leadName = s.lead
        ? [s.lead.first_name, s.lead.last_name].filter(Boolean).join(" ") || "Unnamed lead"
        : "—"
      const repName = s.user
        ? [s.user.first_name, s.user.last_name].filter(Boolean).join(" ").trim() || null
        : null
      return {
        id:         s.id,
        type:       s.signal_type,
        label,
        category,
        signal_value: s.signal_value,
        lead_id:    s.lead?.id ?? null,
        lead_name:  leadName,
        company:    s.lead?.company_name ?? null,
        grade:      s.lead?.grade ?? null,
        rep_id:     s.user?.id ?? null,
        rep_name:   repName,
        created_at: s.created_at,
      }
    })

    return apiSuccess({ items, page, page_size: PAGE_SIZE, total, has_more: page * PAGE_SIZE < total })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Activity feed error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
