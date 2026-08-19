import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { RECOVERY_COOKIE, recoveryCookieOptions } from "@/lib/auth/recovery"

export const dynamic = "force-dynamic"

/**
 * GET /api/auth/password-set — leave the recovery gate.
 *
 * Called by /set-password as a full navigation once the new password is saved.
 * Clearing the cookie and redirecting into the app happen in this one request
 * on purpose: a client that cleared the gate with fetch() and then navigated
 * could succeed at the navigation and fail at the clear, leaving a user who has
 * already set their password bounced back to /set-password until the cookie
 * expired. One request cannot half-happen.
 *
 * No-ops harmlessly when the cookie is absent — the invite flow lands here too.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)

  // Relative, single-slash paths only. This route is reachable while holding a
  // gated session, so an attacker-supplied ?next=https://evil.com would be an
  // open redirect out of a password-reset flow.
  const raw  = searchParams.get("next")
  const dest = raw && /^\/[^/\\]/.test(raw) ? raw : "/dashboard"

  const res = NextResponse.redirect(new URL(dest, origin))
  res.cookies.set(RECOVERY_COOKIE, "", { ...recoveryCookieOptions, maxAge: 0 })
  return res
}
