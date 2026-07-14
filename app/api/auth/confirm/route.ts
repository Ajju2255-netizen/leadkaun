import { createServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { verifyImpersonation, IMPERSONATION_COOKIE } from "@/lib/auth/impersonation"
import { recordAccountEvent } from "@/lib/events/account-events"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * Supabase email-link confirmation handler (SSR / PKCE-safe).
 *
 * Email templates (invite, recovery, signup, magic link) link here with
 * `?token_hash=…&type=…&next=…`. We verify the OTP server-side, which sets the
 * session in cookies (not the URL hash) — avoiding the implicit-flow redirect
 * loop where the client-side token and the cookie-based middleware disagree.
 *
 * The older `/api/auth/callback` route handles the OAuth `?code` exchange
 * (Google) and stays as-is.
 */
const ALLOWED_TYPES: EmailOtpType[] = [
  "invite",
  "recovery",
  "signup",
  "magiclink",
  "email",
  "email_change",
]

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/dashboard"

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = createServerClient()
    // Clear any pre-existing session first. Opening an invite/recovery link
    // while already signed in (e.g. an admin testing their own invite) collides
    // with verifyOtp and leaves a half-set cookie, which getServerSession then
    // rejects — producing a /login ↔ /queue redirect loop. A local sign-out
    // guarantees a clean session swap into the link's account.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {})

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      // Activate invited users on first acceptance — POST /api/team/invite
      // pre-creates a placeholder User (is_active=false) with the right auth_id;
      // getServerSession rejects inactive users, so flip it true here.
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const flipped = await prisma.user.updateMany({
          where: { auth_id: user.id, is_active: false },
          data: { is_active: true, joined_at: new Date() },
        })
        if (flipped.count > 0) {
          const joined = await prisma.user.findFirst({ where: { auth_id: user.id }, select: { account_id: true, email: true } })
          if (joined) {
            await recordAccountEvent({ accountId: joined.account_id, actorUserId: undefined, type: "USER_JOINED", summary: `${joined.email} accepted their invite` })
          }
        }
      }
      // Invited users have no password yet (they accepted via the one-time
      // link), so send them to set one before the dashboard. Other flows
      // (recovery, magic link) honour the requested `next`.
      const dest = type === "invite" ? "/set-password" : next
      const out = NextResponse.redirect(new URL(dest, origin))
      // Platform-admin impersonation hand-off: mark this customer session as
      // impersonated so the app renders the audited banner. Cookie is scoped to
      // this (app) host only; the admin's platform session is unaffected.
      const imp = searchParams.get("imp")
      if (imp && verifyImpersonation(imp)) {
        out.cookies.set(IMPERSONATION_COOKIE, imp, {
          httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60,
        })
      }
      return out
    }

    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    )
  }

  return NextResponse.redirect(new URL("/login?error=auth_link_invalid", origin))
}
