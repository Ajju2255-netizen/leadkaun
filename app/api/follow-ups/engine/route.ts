import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/follow-ups/engine
 *
 * Aggregates the data needed by the Follow-up Engine dashboard:
 *   - score:        weekly completion rate (%)
 *   - active_leads: count of open leads owned by the rep
 *   - new_this_week: open leads created in the last 7 days
 *   - week_consistency: per-day done/missed for the last 7 days
 *   - recent_activity: 3 most recent follow-up signals
 *   - upcoming_7d: next 5 future follow-ups
 *
 * Query: ?rep_id=xxx (Admin/Manager only)
 */
export async function GET(req: Request) {
  try {
    const session  = await requireAuth()
    const { searchParams } = new URL(req.url)
    const repId    = searchParams.get("rep_id")
    const isManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"
    // Match /api/follow-ups behavior: admin without rep_id sees account-wide;
    // a non-manager (or admin filtering by a rep) sees only that rep's slice.
    const targetId: string | undefined = isManager
      ? (repId ?? undefined)
      : session.user.id

    const now      = new Date()
    const today    = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const weekAhead = new Date(today); weekAhead.setDate(weekAhead.getDate() + 7)
    const weekAgo   = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)

    // Defensive promotion: any PENDING with past due_date should be OVERDUE.
    // Inngest is the authoritative source in prod, but this catches the gap if a
    // schedule is missed or the worker is paused — done on every read, idempotent.
    await prisma.followUpAction.updateMany({
      where: {
        account_id: session.account.id,
        ...(targetId ? { assigned_rep_id: targetId } : {}),
        status:     "PENDING",
        due_date:   { lt: now },
      },
      data: { status: "OVERDUE", is_overdue: true, updated_at: now },
    })

    const [
      completedThisWeek,
      overdueOpen,
      activeLeads,
      newThisWeek,
      activityRows,
      upcomingRows,
      weekRows,
    ] = await Promise.all([
      prisma.followUpAction.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          status:          "COMPLETED",
          completed_at:    { gte: weekAgo },
        },
      }),
      prisma.followUpAction.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          status:          "OVERDUE",
        },
      }),
      prisma.lead.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          won_at:          null,
          lost_at:         null,
          is_junk:         false,
        },
      }),
      prisma.lead.count({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          won_at:          null,
          lost_at:         null,
          is_junk:         false,
          created_at:      { gte: weekAgo },
        },
      }),
      // Activity feed: latest 6 follow-up rows (mix of completed + overdue), client trims to 3
      prisma.followUpAction.findMany({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          OR: [
            { status: "COMPLETED", completed_at: { gte: weekAgo } },
            { status: "OVERDUE" },
            { status: "PENDING", due_date: { lt: tomorrow } },
          ],
        },
        include: {
          lead: { select: { id: true, first_name: true, last_name: true } },
        },
        orderBy: [{ updated_at: "desc" }],
        take: 6,
      }),
      // Upcoming preview: next future follow-ups
      prisma.followUpAction.findMany({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          status:          "PENDING",
          due_date:        { gte: tomorrow, lt: weekAhead },
        },
        include: {
          lead: { select: { id: true, first_name: true, last_name: true, grade: true } },
        },
        orderBy: [{ due_date: "asc" }],
        take: 5,
      }),
      // Per-day rows for the last 7 days (completed_at + due_date for missed)
      prisma.followUpAction.findMany({
        where: {
          account_id:      session.account.id,
          assigned_rep_id: targetId,
          OR: [
            { completed_at: { gte: weekAgo, lt: tomorrow } },
            { status: "OVERDUE", due_date: { gte: weekAgo, lt: tomorrow } },
          ],
        },
        select: { status: true, completed_at: true, due_date: true },
      }),
    ])

    const totalForScore = completedThisWeek + overdueOpen
    const score         = totalForScore > 0 ? Math.round((completedThisWeek / totalForScore) * 100) : 100

    // Build per-day status for last 7 days (oldest first)
    const days: { date: string; weekday: string; status: "done" | "missed" | "today" | "future" | "empty" }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const next = new Date(d);  next.setDate(next.getDate() + 1)
      const isToday = d.getTime() === today.getTime()
      const completedOn = weekRows.some(r => r.completed_at && r.completed_at >= d && r.completed_at < next)
      const missedOn    = weekRows.some(r => r.status === "OVERDUE" && r.due_date >= d && r.due_date < next && !r.completed_at)
      let status: "done" | "missed" | "today" | "future" | "empty"
      if (isToday)         status = completedOn ? "done" : "today"
      else if (completedOn) status = "done"
      else if (missedOn)   status = "missed"
      else                 status = "empty"
      days.push({
        date: d.toISOString().slice(0, 10),
        weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()],
        status,
      })
    }

    return apiSuccess({
      score,
      completed_this_week: completedThisWeek,
      overdue_open:        overdueOpen,
      active_leads:        activeLeads,
      new_this_week:       newThisWeek,
      week_consistency:    days,
      recent_activity:     activityRows.map(r => ({
        id:          r.id,
        lead_id:     r.lead.id,
        lead_name:   [r.lead.first_name, r.lead.last_name].filter(Boolean).join(" "),
        action_type: r.action_type,
        status:      r.status,
        due_date:    r.due_date,
        completed_at: r.completed_at,
      })),
      upcoming_7d: upcomingRows.map(r => ({
        id:          r.id,
        lead_id:     r.lead.id,
        lead_name:   [r.lead.first_name, r.lead.last_name].filter(Boolean).join(" "),
        grade:       r.lead.grade,
        action_type: r.action_type,
        due_date:    r.due_date,
      })),
      now: now.toISOString(),
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
