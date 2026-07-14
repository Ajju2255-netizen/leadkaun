import { createServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server" // eslint-disable-line @typescript-eslint/no-unused-vars

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * Supabase OAuth callback handler.
 * Exchanges the auth code for a session and redirects to the app.
 * Used for Google OAuth (Phase 9), magic link, and team-invite flows.
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
      return NextResponse.redirect(new URL(next, req.url))
    }
  }

  // Something went wrong — redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", req.url))
}
