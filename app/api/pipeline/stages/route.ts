import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/pipeline/stages
 *
 * Returns all pipeline stages for the current account, ordered by display_order.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    let stages = await prisma.pipelineStage.findMany({
      where:   { account_id: session.account.id },
      orderBy: { display_order: "asc" },
      select:  { id: true, name: true, key: true, display_order: true, is_terminal: true, is_won: true, is_lost: true },
    })

    // Auto-seed default stages for accounts created before this fix (legacy accounts)
    if (stages.length === 0) {
      const defaults = [
        { name: "New Inquiry",   key: "new_inquiry",   display_order: 1, is_terminal: false, is_won: false, is_lost: false },
        { name: "Contacted",     key: "contacted",      display_order: 2, is_terminal: false, is_won: false, is_lost: false },
        { name: "Qualified",     key: "qualified",      display_order: 3, is_terminal: false, is_won: false, is_lost: false },
        { name: "Proposal Sent", key: "proposal_sent",  display_order: 4, is_terminal: false, is_won: false, is_lost: false },
        { name: "Negotiation",   key: "negotiation",    display_order: 5, is_terminal: false, is_won: false, is_lost: false },
        { name: "Follow-up",     key: "follow_up",      display_order: 6, is_terminal: false, is_won: false, is_lost: false },
        { name: "Won",           key: "won",            display_order: 7, is_terminal: true,  is_won: true,  is_lost: false },
        { name: "Lost",          key: "lost",           display_order: 8, is_terminal: true,  is_won: false, is_lost: true  },
      ]
      await prisma.pipelineStage.createMany({
        data:           defaults.map((s) => ({ ...s, account_id: session.account.id })),
        skipDuplicates: true,
      })
      stages = await prisma.pipelineStage.findMany({
        where:   { account_id: session.account.id },
        orderBy: { display_order: "asc" },
        select:  { id: true, name: true, key: true, display_order: true, is_terminal: true, is_won: true, is_lost: true },
      })
    }

    // Expose display_order as "order" to match the shape the pipeline page expects
    const shaped = stages.map((s) => ({ ...s, order: s.display_order }))

    return apiSuccess({ stages: shaped })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
