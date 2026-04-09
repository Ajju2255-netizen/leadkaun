import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server" // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * Supabase OAuth callback handler.
 * Exchanges the auth code for a session and redirects to the app.
 * Used for Google OAuth (Phase 9) and magic link flows.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(next, req.url))
    }
  }

  // Something went wrong — redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", req.url))
}
