import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { announceProfileCompletedToSlack } from "@/lib/admin/notify"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

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

    // Read first, so we can tell "finished onboarding" from "edited the profile
    // later". Registration seeds industry="Other" and empty city/state, so an
    // account that still has those has never completed its profile.
    const before = await prisma.account.findUnique({
      where: { id: session.account.id },
      select: { industry: true, city: true, created_at: true },
    })
    const wasIncomplete = !before || before.industry === "Other" || before.city.trim() === ""

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

    // The signup alert fires before any of this exists. Send the completed
    // picture once, the first time it becomes available — not on every later
    // profile edit, which would just be noise.
    if (wasIncomplete) {
      const owner = await prisma.user.findFirst({
        where: { account_id: session.account.id, role: "ADMIN", is_active: true },
        orderBy: { created_at: "asc" },
        select: { first_name: true, last_name: true, email: true },
      })
      await announceProfileCompletedToSlack({
        accountId: session.account.id,
        name: data.name.trim(),
        ownerName: owner ? `${owner.first_name} ${owner.last_name ?? ""}`.trim() : null,
        ownerEmail: owner?.email ?? null,
        industry: data.industry.trim(),
        city: data.city.trim(),
        state: data.state.trim(),
        teamSize: data.team_size,
        leadVolume: data.monthly_lead_vol,
        signedUpAt: before?.created_at ?? null,
      })
    }

    return apiSuccess({ ok: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
