import { prisma } from "@/lib/prisma"
import { requirePlatformAdmin } from "@/lib/auth/platform"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { recordAccountEvent } from "@/lib/events/account-events"
import { z } from "zod"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

const Body = z.object({
  accountId: z.string().min(1),
  planKey:   z.string().min(1),
  status:    z.enum(["trialing", "active", "past_due", "canceled"]),
  mrrRupees: z.number().int().min(0),
})

// POST /api/admin/platform/subscription — manual plan/MRR editor (SUPER_ADMIN).
// Provider integration later writes the same rows; this stays the manual path.
export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin("SUPER_ADMIN")
    const { data, error } = await parseBody(req, Body)
    if (error) return error

    const plan = await prisma.plan.findUnique({ where: { key: data.planKey } })
    if (!plan) return apiError("Unknown plan", "BAD_PLAN", 422)

    const mrr = data.mrrRupees * 100 // store paise
    const canceledAt = data.status === "canceled" ? new Date() : null

    await prisma.subscription.upsert({
      where:  { account_id: data.accountId },
      create: { account_id: data.accountId, plan_id: plan.id, status: data.status, mrr_inr: mrr, canceled_at: canceledAt },
      update: { plan_id: plan.id, status: data.status, mrr_inr: mrr, canceled_at: canceledAt },
    })

    await recordAccountEvent({
      accountId: data.accountId,
      type: "PLAN_CHANGED",
      summary: `Plan set to ${plan.name} (${data.status}) · ₹${data.mrrRupees.toLocaleString("en-IN")}/mo by ${admin.email}`,
      detail: { plan: data.planKey, status: data.status, mrrRupees: data.mrrRupees },
    })

    return apiSuccess({ ok: true })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
