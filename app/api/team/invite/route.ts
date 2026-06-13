import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const InviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(["REP", "MANAGER"]),
})

/**
 * POST /api/team/invite
 *
 * Sends a Supabase invite email (48-hour magic link).
 * Creates a placeholder User record so the rep shows up in team list
 * before they accept the invite.
 *
 * Admin only.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN")

    const { data, error } = await parseBody(req, InviteSchema)
    if (error) return error

    // Check for existing user with this email in account
    const existing = await prisma.user.findFirst({
      where: { account_id: session.account.id, email: data.email },
    })
    if (existing) {
      return apiError(`${data.email} is already a member of this account`, "CONFLICT", 409)
    }

    // Send Supabase invite
    const admin = createSupabaseAdminClient()
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      data.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        data: {
          account_id: session.account.id,
          role:       data.role,
          invited_by: session.user.id,
        },
      },
    )

    if (inviteError) {
      return apiError(inviteError.message, "INVITE_FAILED", 500)
    }

    // Create placeholder user record. auth_id is linked now (Supabase issues it
    // at invite time); is_active flips true when the invitee accepts the magic
    // link and hits /auth/callback (see app/api/auth/callback/route.ts).
    await prisma.user.create({
      data: {
        account_id: session.account.id,
        auth_id:    inviteData.user.id,
        email:      data.email,
        first_name: data.email.split("@")[0],
        last_name:  "",
        role:       data.role,
        is_active:  false,          // activated on invite acceptance (auth/callback)
        invited_by: session.user.id,
        invited_at: new Date(),
      },
    })

    return apiSuccess({ invited: true, email: data.email }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Invite error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
