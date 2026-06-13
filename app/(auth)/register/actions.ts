"use server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"
import { sendWelcomeAdminEmail } from "@/lib/email/lead-alerts"

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

// Default pipeline stages — created for every new account so imports + pipeline work immediately
const DEFAULT_PIPELINE_STAGES = [
  { name: "New Inquiry",   key: "new_inquiry",   display_order: 1, is_terminal: false, is_won: false, is_lost: false },
  { name: "Contacted",     key: "contacted",      display_order: 2, is_terminal: false, is_won: false, is_lost: false },
  { name: "Qualified",     key: "qualified",      display_order: 3, is_terminal: false, is_won: false, is_lost: false },
  { name: "Proposal Sent", key: "proposal_sent",  display_order: 4, is_terminal: false, is_won: false, is_lost: false },
  { name: "Negotiation",   key: "negotiation",    display_order: 5, is_terminal: false, is_won: false, is_lost: false },
  { name: "Follow-up",     key: "follow_up",      display_order: 6, is_terminal: false, is_won: false, is_lost: false },
  { name: "Won",           key: "won",            display_order: 7, is_terminal: true,  is_won: true,  is_lost: false },
  { name: "Lost",          key: "lost",           display_order: 8, is_terminal: true,  is_won: false, is_lost: true  },
]

// Default lead sources — created for every new account so import source dropdown is pre-populated
const DEFAULT_LEAD_SOURCES = [
  { name: "Google Ads",           key: "google_ads",           intent_baseline: 55, reliability_score: 90.0,  is_custom: false },
  { name: "Google Organic SEO",   key: "google_organic",       intent_baseline: 65, reliability_score: 95.0,  is_custom: false },
  { name: "Facebook Ads",         key: "facebook_ads",         intent_baseline: 35, reliability_score: 75.0,  is_custom: false },
  { name: "Instagram Ads",        key: "instagram_ads",        intent_baseline: 30, reliability_score: 70.0,  is_custom: false },
  { name: "LinkedIn Ads",         key: "linkedin_ads",         intent_baseline: 50, reliability_score: 85.0,  is_custom: false },
  { name: "Website Contact Form", key: "website_contact_form", intent_baseline: 65, reliability_score: 92.0,  is_custom: false },
  { name: "Website Chat",         key: "website_chat",         intent_baseline: 70, reliability_score: 93.0,  is_custom: false },
  { name: "Referral",             key: "referral",             intent_baseline: 75, reliability_score: 96.0,  is_custom: false },
  { name: "WhatsApp Business",    key: "whatsapp_business",    intent_baseline: 60, reliability_score: 88.0,  is_custom: false },
  { name: "JustDial",             key: "justdial",             intent_baseline: 50, reliability_score: 80.0,  is_custom: false },
  { name: "IndiaMART",            key: "indiamart",            intent_baseline: 60, reliability_score: 85.0,  is_custom: false },
  { name: "Cold Call Outbound",   key: "cold_call_outbound",   intent_baseline: 20, reliability_score: 65.0,  is_custom: false },
  { name: "Exhibition / Event",   key: "exhibition_event",     intent_baseline: 55, reliability_score: 82.0,  is_custom: false },
  { name: "Walk-in",              key: "walk_in",              intent_baseline: 70, reliability_score: 90.0,  is_custom: false },
  { name: "Re-inquiry",           key: "re_inquiry",           intent_baseline: 50, reliability_score: 82.0,  is_custom: false },
  { name: "Partner / Reseller",   key: "partner_reseller",     intent_baseline: 65, reliability_score: 88.0,  is_custom: false },
  { name: "Other",                key: "other",                intent_baseline: 10, reliability_score: 50.0,  is_custom: false },
]

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

      await tx.user.create({
        data: {
          account_id: account.id,
          auth_id: authData.user!.id,
          email,
          first_name: firstName,
          last_name: lastName,
          role: "ADMIN",            // first user of an account is always ADMIN
        },
      })

      // Seed default pipeline stages so pipeline + import work immediately after registration
      await tx.pipelineStage.createMany({
        data: DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, account_id: account.id })),
        skipDuplicates: true,
      })

      // Seed default lead sources so import source dropdown is pre-populated
      await tx.leadSource.createMany({
        data: DEFAULT_LEAD_SOURCES.map((s) => ({ ...s, account_id: account.id })),
        skipDuplicates: true,
      })
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
