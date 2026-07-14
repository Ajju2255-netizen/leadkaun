import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { recordAccountEvent } from "@/lib/events/account-events"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSeatUsage } from "@/lib/billing/seats"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

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

    const limited = await rateLimited(`team:invite:${session.account.id}`, LIMITS.workspace)
    if (limited) return limited

    const { data, error } = await parseBody(req, InviteSchema)
    if (error) return error

    // Check for existing user with this email in account
    const existing = await prisma.user.findFirst({
      where: { account_id: session.account.id, email: data.email },
    })
    if (existing) {
      return apiError(`${data.email} is already a member of this account`, "CONFLICT", 409)
    }

    // Seat limit. This must run BEFORE the Supabase invite is sent — otherwise
    // the invitee gets an email for a seat we then refuse to give them.
    const seats = await getSeatUsage(session.account.id)
    if (seats.isFull) {
      return apiError(
        `Your ${seats.planName} plan includes ${seats.limit} seat${seats.limit === 1 ? "" : "s"} and all of them are in use. Upgrade your plan or remove a member to invite someone new.`,
        "SEAT_LIMIT_REACHED",
        409,
      )
    }

    // Send Supabase invite
    const admin = createSupabaseAdminClient()
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      data.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/dashboard`,
        data: {
          account_id: session.account.id,
          role:       data.role,
          invited_by: session.user.id,
        },
      },
    )

    if (inviteError) {
      // Surface Supabase's reason with the right status so the toast is clear
      // instead of a generic "Internal server error" 500.
      const msg = inviteError.message || "Could not send the invite"
      const lower = msg.toLowerCase()
      if (lower.includes("invalid") && lower.includes("email")) {
        return apiError(
          `"${data.email}" was rejected as an invalid email. Use a real, deliverable address (test domains like example.com are blocked).`,
          "INVALID_EMAIL",
          422,
        )
      }
      if (lower.includes("already been registered") || lower.includes("already registered")) {
        return apiError(`${data.email} already has an account.`, "CONFLICT", 409)
      }
      if (lower.includes("rate limit") || lower.includes("too many")) {
        return apiError(
          "Email sending limit reached. The default Supabase email service allows only a few invites per hour — configure custom SMTP in Supabase Auth to lift this.",
          "RATE_LIMITED",
          429,
        )
      }
      console.error("Supabase invite error:", msg)
      return apiError(msg, "INVITE_FAILED", 422)
    }

    // Create placeholder user record. auth_id is linked now (Supabase issues it
    // at invite time); is_active flips true when the invitee accepts the magic
    // link and hits /auth/callback (see app/api/auth/callback/route.ts).
    const newUser = await prisma.user.create({
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

    // Add the invitee to the inviter's active workspace so a MANAGER/REP lands
    // in a usable environment on acceptance instead of the "no workspace" empty
    // state. (ADMINs see every workspace regardless; this is harmless for them.)
    // Admins can reassign workspaces later in Settings → Workspaces.
    if (session.workspace) {
      await prisma.workspaceMember.create({
        data: { workspace_id: session.workspace.id, user_id: newUser.id },
      }).catch((e) => console.warn("[invite] could not add workspace member:", String(e)))
    }

    await recordAccountEvent({
      accountId: session.account.id,
      workspaceId: session.workspace?.id ?? null,
      actorUserId: session.user.id,
      type: "USER_INVITED",
      summary: `Invited ${data.email} as ${data.role}`,
      detail: { email: data.email, role: data.role },
    })

    return apiSuccess({ invited: true, email: data.email }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Invite error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
