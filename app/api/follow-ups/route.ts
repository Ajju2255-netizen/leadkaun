import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/follow-ups
 *
 * Returns today's pending follow-up actions for the current rep.
 * Managers/Admins get all overdue actions across the account.
 */
export async function GET(req: Request) {
  try {
    const session = await requireWorkspace()
    const { searchParams } = new URL(req.url)
    const repId = searchParams.get("rep_id") ?? undefined

    const today    = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const isManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"
    const repFilterId = isManager ? (repId ?? undefined) : session.user.id

    // Defensive promotion: PENDING with past due → OVERDUE. Idempotent.
    await prisma.followUpAction.updateMany({
      where: {
        account_id: session.account.id, workspace_id: session.workspace.id,
        ...(repFilterId ? { assigned_rep_id: repFilterId } : {}),
        status:     "PENDING",
        due_date:   { lt: new Date() },
      },
      data: { status: "OVERDUE", is_overdue: true },
    })

    const actions = await prisma.followUpAction.findMany({
      where: {
        account_id:      session.account.id,
        assigned_rep_id: repFilterId,
        status:          { in: ["PENDING", "OVERDUE"] },
        due_date:        { lt: tomorrow },
      },
      include: {
        lead: {
          select: {
            id:             true,
            first_name:     true,
            last_name:      true,
            grade:          true,
            company_name:   true,
            phone:          true,
            expected_value: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { due_date: "asc" }],
      take: 100,
    })

    return apiSuccess({ actions, total: actions.length })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
