import { prisma } from "@/lib/prisma"
import { requirePlatformAdmin } from "@/lib/auth/platform"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { signImpersonation } from "@/lib/auth/impersonation"
import { recordAccountEvent } from "@/lib/events/account-events"
import { z } from "zod"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

const Body = z.object({ accountId: z.string().min(1), targetUserId: z.string().optional(), reason: z.string().max(200).optional() })

/**
 * POST /api/admin/platform/impersonate — start an audited "Login as Customer".
 * SUPER_ADMIN only. Mints a one-time Supabase magic link for the target user
 * and returns a URL that, when opened, logs in as that customer on the app host
 * (separate cookie scope) with a persistent audited banner. Writes the audit
 * row BEFORE returning the link.
 */
export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin("SUPER_ADMIN")
    const { data, error } = await parseBody(req, Body)
    if (error) return error

    // Target = explicit user, else the account's first active ADMIN.
    const target = data.targetUserId
      ? await prisma.user.findFirst({ where: { id: data.targetUserId, account_id: data.accountId, is_active: true } })
      : await prisma.user.findFirst({ where: { account_id: data.accountId, role: "ADMIN", is_active: true }, orderBy: { created_at: "asc" } })
    if (!target) return apiError("No active admin user to impersonate in this account", "NO_TARGET", 404)

    const supa = createSupabaseAdminClient()
    const { data: link, error: linkErr } = await supa.auth.admin.generateLink({ type: "magiclink", email: target.email })
    if (linkErr || !link?.properties?.hashed_token) {
      return apiError(linkErr?.message ?? "Could not generate sign-in link", "LINK_FAILED", 500)
    }

    const log = await prisma.impersonationLog.create({
      data: {
        admin_auth_id: admin.authId,
        admin_email:   admin.email,
        account_id:    data.accountId,
        target_user_id: target.id,
        reason:        data.reason ?? null,
        ip:            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    })

    await recordAccountEvent({
      accountId: data.accountId,
      type: "IMPERSONATED",
      summary: `Admin ${admin.email} logged in as ${target.email}`,
      detail: { adminEmail: admin.email, targetEmail: target.email, reason: data.reason ?? null },
    })

    const marker = signImpersonation({
      logId: log.id, byEmail: admin.email, accountId: data.accountId,
      exp: Date.now() + 60 * 60 * 1000, // 1h
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const url = `${appUrl}/api/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=/queue&imp=${encodeURIComponent(marker)}`

    return apiSuccess({ url, logId: log.id })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
