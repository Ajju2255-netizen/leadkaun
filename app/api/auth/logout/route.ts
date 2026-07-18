import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Clears the session cookie — always dynamic.
export const dynamic = "force-dynamic"

/**
 * GET /api/auth/logout — clear the Supabase session, then return to /login.
 *
 * The dashboard layout redirects here (instead of straight to /login) when
 * getServerSession resolves to null while a Supabase cookie still exists — e.g.
 * the DB user was deactivated mid-session, or the refresh token went stale.
 * Middleware would otherwise bounce /login → /queue (it only sees the Supabase
 * cookie) while the layout bounces /queue → /login (it sees no active DB user),
 * an infinite loop. Signing out server-side clears the cookie and breaks it.
 * (This route is under /api, which the middleware matcher excludes, so it can't
 * be bounced itself.)
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  await supabase.auth.signOut({ scope: "local" }).catch(() => {})
  return NextResponse.redirect(new URL("/login", req.url))
}
