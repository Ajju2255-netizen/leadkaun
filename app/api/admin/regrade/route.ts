import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"

export const maxDuration = 300

/**
 * POST /api/admin/regrade
 *
 * Re-runs the scoring pipeline for every lead in the account.
 * Use after grade threshold changes or ICP updates.
 * Admin/Manager only.
 */
export async function POST() {
  try {
    const session = await requireAuth()

    if (session.user.role === "REP") {
      return apiError("Only Admins and Managers can regrade leads", "FORBIDDEN", 403)
    }

    // Fetch all non-won/lost lead IDs for this account
    const leads = await prisma.lead.findMany({
      where: {
        account_id: session.account.id,
        is_junk:    false,
        stage: { is_won: false, is_lost: false },
      },
      select: { id: true },
    })

    let updated = 0
    let failed  = 0

    for (const lead of leads) {
      try {
        await processSignalAndUpdateScores(lead.id, session.account.id, prisma)
        updated++
      } catch {
        failed++
      }
    }

    return apiSuccess({ updated, failed, total: leads.length })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
