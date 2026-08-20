/**
 * Account creation, shared by every way in.
 *
 * There are two front doors and they must not drift: the /register page's
 * server action, and the POST endpoint the marketing site's signup form
 * submits to directly. Both call this. Nothing here knows or cares which one
 * it was reached through.
 */
import { headers, cookies } from "next/headers"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"
import { sendWelcomeAdminEmail } from "@/lib/email/lead-alerts"
import { provisionWorkspaceDefaults, provisionSampleWorkspace } from "@/lib/workspace/provision"
import { recordAccountEvent } from "@/lib/events/account-events"
import { normalisePhone } from "@/lib/import/phone-normalise"
import { announceSignupsToSlack } from "@/lib/admin/notify"

export type RegisterInput = {
  orgName: string
  email: string
  phone: string
  password: string
  firstName: string
  lastName: string
}

export type RegisterResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string }

export async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  const { orgName, email, password, firstName, lastName, phone } = input

  const admin = createSupabaseAdminClient()

  // 1. Create Supabase auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm in dev; configure email templates in prod
  })

  if (authError || !authData.user) {
    return { success: false, error: authError?.message ?? "Failed to create user" }
  }

  // Signup attribution (best-effort): IP/country from edge headers, UTM from
  // cookies the marketing site may have set. Null when absent — never fabricated.
  const h = headers()
  const c = cookies()
  const attribution = {
    signup_ip:           h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    signup_country:      h.get("x-vercel-ip-country") ?? null,
    signup_utm_source:   c.get("utm_source")?.value ?? null,
    signup_utm_campaign: c.get("utm_campaign")?.value ?? null,
  }

  // Richer first-touch context, written by the marketing site's proxy.ts.
  // Account has only the four columns above, so the rest is kept on the
  // SIGNUP AccountEvent's `detail` JSON — which answers the question the
  // four columns cannot: WHICH PAGE earned this signup, and was it organic
  // search, an AI answer engine, or a referral. Adding columns for these
  // would need a migration, and prod migrations here are run by hand.
  const firstTouch = {
    medium:    c.get("lk_medium")?.value ?? null,
    landing:   c.get("lk_landing")?.value ?? null,
    referrer:  c.get("lk_referrer")?.value ?? null,
    firstSeen: c.get("lk_first_seen")?.value ?? null,
  }

  let created: { accountId: string; workspaceId: string; userId: string } | null = null
  try {
    // 2. Create Account + User + default pipeline stages + lead sources in one transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    created = await prisma.$transaction(async (tx: any) => {
      const account = await tx.account.create({
        data: {
          name: orgName,
          industry: "Other",        // updated during onboarding step 1
          city: "",
          state: "",
          team_size: "SOLO",
          monthly_lead_vol: "UNDER_50",
          ...attribution,
        },
      })

      const user = await tx.user.create({
        data: {
          account_id: account.id,
          auth_id: authData.user!.id,
          email,
          first_name: firstName,
          last_name: lastName,
          // Same normaliser the lead pipeline uses, so an owner's number and a
          // lead's number are stored identically. Unverified — see schema note.
          phone:     normalisePhone(phone) || null,
          phone_raw: phone || null,
          role: "ADMIN",            // first user of an account is always ADMIN
        },
      })

      // Every account starts with one default workspace; the admin is its first
      // member. Default pipeline stages + lead sources are seeded INTO it so
      // pipeline + import work immediately after registration.
      const workspace = await tx.workspace.create({
        data: {
          account_id:  account.id,
          name:        "Main",
          slug:        "main",
          is_default:  true,
          description: "Your primary workspace.",
        },
      })
      await tx.workspaceMember.create({
        data: { workspace_id: workspace.id, user_id: user.id },
      })
      await provisionWorkspaceDefaults(tx, { accountId: account.id, workspaceId: workspace.id })

      // A second workspace of example leads, so the product can be understood
      // before anything is imported. Removed on first real import, or on demand.
      await provisionSampleWorkspace(tx, { accountId: account.id, userId: user.id })

      return { accountId: account.id, workspaceId: workspace.id, userId: user.id }
    })
  } catch (dbError) {
    // Rollback: delete the Supabase auth user we just created
    await admin.auth.admin.deleteUser(authData.user.id)
    console.error("Register DB error:", dbError)
    return { success: false, error: "Account creation failed. Please try again." }
  }

  // First Company Timeline event (best-effort).
  if (created) {
    await recordAccountEvent({
      accountId: created.accountId,
      workspaceId: created.workspaceId,
      actorUserId: created.userId,
      type: "SIGNUP",
      summary: `${orgName} signed up`,
      detail: {
        email,
        source:   attribution.signup_utm_source,
        campaign: attribution.signup_utm_campaign,
        country:  attribution.signup_country,
        ...firstTouch,
      },
    })
  }

  // Buzz the platform admins' phones now, rather than waiting up to 15 minutes
  // for the signup-alert job. Awaited rather than fire-and-forget because a
  // serverless function is not guaranteed to finish work started after the
  // response; announceSignupsToSlack resolves false instead of throwing, and
  // no-ops entirely when ADMIN_SLACK_WEBHOOK_URL is unset.
  //
  // Everything known at this instant. industry / city / state / team size /
  // lead volume are NOT here because they are collected during onboarding —
  // the follow-up alert in PATCH /api/profile/account carries those. The phone
  // IS included now that signup collects it, but it is unverified: no OTP is
  // sent, so treat it as self-declared contact data.
  if (created) {
    await announceSignupsToSlack([{
      accountId: created.accountId,
      name: orgName,
      ownerName: `${firstName} ${lastName}`.trim(),
      ownerEmail: email,
      ownerPhone: normalisePhone(phone) || phone,
      source: attribution.signup_utm_source,
      campaign: attribution.signup_utm_campaign,
      country: attribution.signup_country,
      signedUpAt: new Date(),
    }])
  }

  // Send the admin welcome email (audit B8). Guarded — never blocks/fails signup.
  await sendWelcomeAdminEmail({ to: email, adminFirstName: firstName, orgName })

  return { success: true, redirectTo: "/onboarding" }
}
