"use server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"

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
    // 2. Create Account + User in a transaction
    await prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          name: orgName,
          industry: "Other",           // updated during onboarding step 1
          city: "",
          state: "",
          team_size: "SOLO",
          monthly_lead_vol: "UNDER_50",
        },
      })

      await tx.user.create({
        data: {
          account_id: account.id,
          auth_id: authData.user!.id,
          email,
          first_name: firstName,
          last_name: lastName,
          role: "ADMIN",              // first user of an account is always ADMIN
        },
      })
    })
  } catch (dbError) {
    // Rollback: delete the Supabase auth user we just created
    await admin.auth.admin.deleteUser(authData.user.id)
    console.error("Register DB error:", dbError)
    return { success: false, error: "Account creation failed. Please try again." }
  }

  return { success: true, redirectTo: "/onboarding" }
}
