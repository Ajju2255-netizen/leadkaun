import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { computeExecutionScore } from "@/lib/scoring/execution-score"
import { startOfIstDay, hourIST } from "@/lib/time/ist"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/analytics/execution-score
 *
 *   ?rep_id=xxx                — returns one rep's score + components
 *   (no param, manager call)   — returns array for every active rep
 *
 * Drives:
 *   - /rep-tracking page (Daily Execution column + 5-bar score breakdown)
 *   - inngest/exec-score-alert cron (low-score detection at 3pm IST)
 *
 * Implementation note: the manager path issues O(N reps) round-trips per
 * metric via Prisma groupBy, NOT N × 5 queries. Scales to ~hundreds of reps
 * per account without N+1 blowup.
 */
export async function GET(req: Request) {
  try {
    const session   = await requireWorkspace()
    const accountId = session.account.id
    const workspaceId = session.workspace.id
    const url       = new URL(req.url)
    const repIdParam = url.searchParams.get("rep_id")

    const now       = new Date()
    const dayStart  = startOfIstDay(now)
    const hr        = hourIST(now)

    if (repIdParam) {
      // Single-rep path
      const inputs = await loadRepInputs(accountId, workspaceId, repIdParam, dayStart, hr)
      const result = computeExecutionScore(inputs)
      return apiSuccess({
        rep_id: repIdParam,
        as_of:  now.toISOString(),
        hour_ist: hr,
        inputs,
        ...result,
      })
    }

    // Manager path — only ADMIN/MANAGER can read account-wide stats
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
      return apiError("Forbidden", "FORBIDDEN", 403)
    }

    const reps = await prisma.user.findMany({
      where: {
        account_id: accountId,
        is_active:  true,
        role:       { in: ["REP", "MANAGER", "ADMIN"] },
      },
      select: { id: true, first_name: true, last_name: true, role: true },
      orderBy: { first_name: "asc" },
    })

    if (reps.length === 0) {
      return apiSuccess({ as_of: now.toISOString(), hour_ist: hr, reps: [] })
    }

    const repIds = reps.map((r) => r.id)
    const inputsByRep = await loadInputsBatch(accountId, workspaceId, repIds, dayStart)

    const results = reps.map((rep) => {
      const inputs = { ...inputsByRep[rep.id], hour_ist: hr }
      const result = computeExecutionScore(inputs)
      return {
        rep_id:     rep.id,
        first_name: rep.first_name,
        last_name:  rep.last_name,
        role:       rep.role,
        score:      result.score,
        components: result.components,
      }
    })

    return apiSuccess({
      as_of:    now.toISOString(),
      hour_ist: hr,
      reps:     results,
    })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function loadRepInputs(
  accountId: string,
  workspaceId: string,
  repId: string,
  dayStart: Date,
  hr: number,
) {
  const [
    fuDue, fuCompleted, fuOverdue,
    touched, abLeads, abContacted, signals,
  ] = await Promise.all([
    prisma.followUpAction.count({
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId,
               due_date: { gte: dayStart } },
    }),
    prisma.followUpAction.count({
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId,
               status: "COMPLETED", completed_at: { gte: dayStart } },
    }),
    prisma.followUpAction.count({
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId, status: "OVERDUE" },
    }),
    prisma.lead.count({
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId,
               last_action_at: { gte: dayStart } },
    }),
    prisma.lead.count({
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId,
               grade: { in: ["A", "B"] }, imported_at: { gte: dayStart } },
    }),
    prisma.lead.count({
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: repId,
               grade: { in: ["A", "B"] }, imported_at: { gte: dayStart },
               first_contact_at: { not: null } },
    }),
    prisma.signal.count({
      where: { user_id: repId, created_at: { gte: dayStart },
               lead: { account_id: accountId, workspace_id: workspaceId } },
    }),
  ])

  return {
    fu_due_today:        fuDue,
    fu_completed_today:  fuCompleted,
    fu_overdue_now:      fuOverdue,
    leads_touched_today: touched,
    ab_leads_today:      abLeads,
    ab_leads_contacted:  abContacted,
    signals_today:       signals,
    hour_ist:            hr,
  }
}

/**
 * Manager path — load inputs for every rep in one batched pass per metric.
 * Uses Prisma groupBy for O(metrics) round-trips instead of O(reps × metrics).
 */
async function loadInputsBatch(
  accountId: string,
  workspaceId: string,
  repIds: string[],
  dayStart: Date,
) {
  type Inputs = Omit<Awaited<ReturnType<typeof loadRepInputs>>, "hour_ist">

  // Initialise zeroed buckets so reps with no activity still appear
  const out: Record<string, Inputs> = Object.fromEntries(
    repIds.map((id) => [id, {
      fu_due_today: 0, fu_completed_today: 0, fu_overdue_now: 0,
      leads_touched_today: 0, ab_leads_today: 0, ab_leads_contacted: 0,
      signals_today: 0,
    }]),
  )

  const [
    fuDueAgg, fuCompletedAgg, fuOverdueAgg,
    touchedAgg, abLeadsAgg, abContactedAgg, signalsAgg,
  ] = await Promise.all([
    prisma.followUpAction.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: { in: repIds },
               due_date: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.followUpAction.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: { in: repIds },
               status: "COMPLETED", completed_at: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.followUpAction.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: { in: repIds }, status: "OVERDUE" },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: { in: repIds },
               last_action_at: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: { in: repIds },
               grade: { in: ["A", "B"] }, imported_at: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"],
      where: { account_id: accountId, workspace_id: workspaceId, assigned_rep_id: { in: repIds },
               grade: { in: ["A", "B"] }, imported_at: { gte: dayStart },
               first_contact_at: { not: null } },
      _count: { _all: true },
    }),
    prisma.signal.groupBy({
      by: ["user_id"],
      where: { user_id: { in: repIds }, created_at: { gte: dayStart },
               lead: { account_id: accountId, workspace_id: workspaceId } },
      _count: { _all: true },
    }),
  ])

  for (const row of fuDueAgg)       if (row.assigned_rep_id && out[row.assigned_rep_id]) out[row.assigned_rep_id].fu_due_today        = row._count._all
  for (const row of fuCompletedAgg) if (row.assigned_rep_id && out[row.assigned_rep_id]) out[row.assigned_rep_id].fu_completed_today  = row._count._all
  for (const row of fuOverdueAgg)   if (row.assigned_rep_id && out[row.assigned_rep_id]) out[row.assigned_rep_id].fu_overdue_now      = row._count._all
  for (const row of touchedAgg)     if (row.assigned_rep_id && out[row.assigned_rep_id]) out[row.assigned_rep_id].leads_touched_today = row._count._all
  for (const row of abLeadsAgg)     if (row.assigned_rep_id && out[row.assigned_rep_id]) out[row.assigned_rep_id].ab_leads_today      = row._count._all
  for (const row of abContactedAgg) if (row.assigned_rep_id && out[row.assigned_rep_id]) out[row.assigned_rep_id].ab_leads_contacted  = row._count._all
  for (const row of signalsAgg)     if (row.user_id && out[row.user_id])                  out[row.user_id].signals_today              = row._count._all

  return out
}
