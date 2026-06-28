import { prisma } from "@/lib/prisma"
import { requirePlatformAdmin } from "@/lib/auth/platform"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { recordAccountEvent } from "@/lib/events/account-events"
import { FEATURE_KEYS, type FeatureKey } from "@/lib/feature-flags"
import { z } from "zod"

const Body = z.object({ accountId: z.string().min(1), key: z.string().min(1), enabled: z.boolean() })

// POST /api/admin/platform/feature-flags — toggle a per-account feature flag.
export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin("SUPER_ADMIN")
    const { data, error } = await parseBody(req, Body)
    if (error) return error
    if (!(FEATURE_KEYS as readonly string[]).includes(data.key)) {
      return apiError("Unknown feature key", "BAD_KEY", 422)
    }

    await prisma.featureFlag.upsert({
      where:  { account_id_key: { account_id: data.accountId, key: data.key } },
      create: { account_id: data.accountId, key: data.key as FeatureKey, enabled: data.enabled, updated_by: admin.authId },
      update: { enabled: data.enabled, updated_by: admin.authId },
    })

    await recordAccountEvent({
      accountId: data.accountId,
      type: "FEATURE_FLAG_CHANGED",
      summary: `${data.key} ${data.enabled ? "enabled" : "disabled"} by ${admin.email}`,
      detail: { key: data.key, enabled: data.enabled },
    })

    return apiSuccess({ ok: true })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
