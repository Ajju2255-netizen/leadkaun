import { createServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server" // eslint-disable-line @typescript-eslint/no-unused-vars
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE, RECOVERY_PATH, recoveryCookieOptions } from "@/lib/auth/recovery"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * Supabase OAuth callback handler.
 * Exchanges the auth code for a session and redirects to the app.
 * Used for Google OAuth (Phase 9), magic link, team-invite and recovery flows.
 *
 * `?flow=recovery` marks the resulting session as a password reset. It still is
 * a real session — Supabase cannot set a password without one — but it is
 * cookie-flagged so middleware confines it to /set-password until the new
 * password is saved. Without that flag a reset email doubles as a permanent
 * one-click login to the whole product.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Activate invited users on first acceptance. POST /api/team/invite
      // pre-creates a placeholder User with the correct Supabase auth_id but
      // is_active=false; getServerSession rejects inactive users, so the
      // invitee would be bounced to /login forever. Flip it true here.
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        await prisma.user.updateMany({
          where: { auth_id: user.id, is_active: false },
          data: { is_active: true, joined_at: new Date() },
        })
      }
      const isRecovery = searchParams.get("flow") === "recovery"

      // Destination is derived, never taken from `next` for a recovery link —
      // the earlier bug was exactly that, sending the user to /settings/security
      // signed in and unrestricted.
      const dest = isRecovery ? RECOVERY_PATH : next
      const out = NextResponse.redirect(new URL(dest, req.url))
      if (isRecovery) {
        out.cookies.set(RECOVERY_COOKIE, "1", { ...recoveryCookieOptions, maxAge: RECOVERY_MAX_AGE })
      }
      return out
    }
  }

  // Something went wrong — redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", req.url))
}
