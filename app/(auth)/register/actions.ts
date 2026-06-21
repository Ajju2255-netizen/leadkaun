"use server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"
import { sendWelcomeAdminEmail } from "@/lib/email/lead-alerts"
import { provisionWorkspaceDefaults } from "@/lib/workspace/provision"

type RegisterInput = {
  orgName: string
  email: string
  password: string
  firstName: string
  lastName: string
}

type RegisterResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string }

export async function registerAction(input: RegisterInput): Promise<RegisterResult> {
  const { orgName, email, password, firstName, lastName } = input

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

  try {
    // 2. Create Account + User + default pipeline stages + lead sources in one transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      const account = await tx.account.create({
        data: {
          name: orgName,
          industry: "Other",        // updated during onboarding step 1
          city: "",
          state: "",
          team_size: "SOLO",
          monthly_lead_vol: "UNDER_50",
        },
      })

      const user = await tx.user.create({
        data: {
          account_id: account.id,
          auth_id: authData.user!.id,
          email,
          first_name: firstName,
          last_name: lastName,
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
    })
  } catch (dbError) {
    // Rollback: delete the Supabase auth user we just created
    await admin.auth.admin.deleteUser(authData.user.id)
    console.error("Register DB error:", dbError)
    return { success: false, error: "Account creation failed. Please try again." }
  }

  // Send the admin welcome email (audit B8). Guarded — never blocks/fails signup.
  await sendWelcomeAdminEmail({ to: email, adminFirstName: firstName, orgName })

  return { success: true, redirectTo: "/onboarding" }
}
