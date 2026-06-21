import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

const UpdateSchema = z.object({
  name:             z.string().min(1).max(120),
  industry:         z.string().min(1).max(80),
  city:             z.string().min(1).max(80),
  state:            z.string().min(1).max(80),
  team_size:        z.enum(["SOLO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE"]),
  monthly_lead_vol: z.enum(["UNDER_50", "BETWEEN_50_200", "BETWEEN_200_500", "BETWEEN_500_1000", "OVER_1000"]),
})

/**
 * GET /api/profile/account
 * Returns organisation details for the current account.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    const account = await prisma.account.findUnique({
      where:  { id: session.account.id },
      select: { name: true, industry: true, city: true, state: true, team_size: true, monthly_lead_vol: true },
    })

    return apiSuccess({ account })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

/**
 * PATCH /api/profile/account
 * Update organisation details. Admin only.
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`profile:account:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const { data, error } = await parseBody(req, UpdateSchema)
    if (error) return error

    await prisma.account.update({
      where: { id: session.account.id },
      data: {
        name:             data.name.trim(),
        industry:         data.industry.trim(),
        city:             data.city.trim(),
        state:            data.state.trim(),
        team_size:        data.team_size,
        monthly_lead_vol: data.monthly_lead_vol,
      },
    })

    return apiSuccess({ ok: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
