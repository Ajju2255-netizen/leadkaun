import { prisma } from "@/lib/prisma"
import { requirePlatformAdmin } from "@/lib/auth/platform"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

// POST /api/admin/platform/mfa-verified — stamp platform_admins.mfa_enrolled_at.
//
// Called by /admin/security/mfa once Supabase has verified the TOTP factor, so
// the session is already AAL2 and requirePlatformAdmin passes. The column was in
// the schema from the start but nothing ever wrote it, which left no way to tell
// an enrolled admin from an unenrolled one without querying Supabase.
//
// No role argument: SUPPORT admins enrol too. Idempotent — only the first
// verification stamps, so the column records enrolment, not the latest login.
export async function POST() {
  try {
    const admin = await requirePlatformAdmin()

    await prisma.platformAdmin.updateMany({
      where: { auth_id: admin.authId, mfa_enrolled_at: null },
      data:  { mfa_enrolled_at: new Date() },
    })

    return apiSuccess({ ok: true })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
