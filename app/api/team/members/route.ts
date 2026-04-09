import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/team/members
 * Returns all users in the account (active + invited).
 * Admin/Manager only.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")

    const members = await prisma.user.findMany({
      where:   { account_id: session.account.id },
      select: {
        id:         true,
        email:      true,
        first_name: true,
        last_name:  true,
        role:       true,
        is_active:  true,
        invited_at: true,
        _count: {
          select: { assigned_leads: true },
        },
      },
      orderBy: [{ role: "asc" }, { first_name: "asc" }],
    })

    return apiSuccess({ members })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
