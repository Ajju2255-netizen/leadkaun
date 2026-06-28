import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createServerClient } from "@/lib/supabase/server"
import { verifyImpersonation, IMPERSONATION_COOKIE } from "@/lib/auth/impersonation"

/**
 * POST /api/auth/impersonate-exit — end an impersonation: close the audit row,
 * sign out the impersonated session, clear the marker, return to the admin panel.
 */
export async function POST() {
  const token = cookies().get(IMPERSONATION_COOKIE)?.value
  const marker = verifyImpersonation(token)

  if (marker) {
    await prisma.impersonationLog.updateMany({
      where: { id: marker.logId, ended_at: null },
      data: { ended_at: new Date() },
    }).catch(() => {})
  }

  await createServerClient().auth.signOut({ scope: "local" }).catch(() => {})

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://admin.leadkaun.com"
  const dest = marker ? `${adminUrl}/customers/${marker.accountId}` : adminUrl

  const res = NextResponse.redirect(dest, { status: 303 })
  res.cookies.set(IMPERSONATION_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}
