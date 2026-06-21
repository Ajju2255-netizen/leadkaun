import type { Prisma } from "@prisma/client"

/**
 * Default pipeline stages + lead sources seeded into EVERY new workspace, so
 * pipeline + import work immediately. A workspace is a self-contained
 * environment, so these are scoped by both account_id and workspace_id.
 */

export const DEFAULT_PIPELINE_STAGES = [
  { name: "New Inquiry",   key: "new_inquiry",   display_order: 1, is_terminal: false, is_won: false, is_lost: false },
  { name: "Contacted",     key: "contacted",      display_order: 2, is_terminal: false, is_won: false, is_lost: false },
  { name: "Qualified",     key: "qualified",      display_order: 3, is_terminal: false, is_won: false, is_lost: false },
  { name: "Proposal Sent", key: "proposal_sent",  display_order: 4, is_terminal: false, is_won: false, is_lost: false },
  { name: "Negotiation",   key: "negotiation",    display_order: 5, is_terminal: false, is_won: false, is_lost: false },
  { name: "Follow-up",     key: "follow_up",      display_order: 6, is_terminal: false, is_won: false, is_lost: false },
  { name: "Won",           key: "won",            display_order: 7, is_terminal: true,  is_won: true,  is_lost: false },
  { name: "Lost",          key: "lost",           display_order: 8, is_terminal: true,  is_won: false, is_lost: true  },
]

export const DEFAULT_LEAD_SOURCES = [
  { name: "Google Ads",           key: "google_ads",           intent_baseline: 55, reliability_score: 90.0, is_custom: false },
  { name: "Google Organic SEO",   key: "google_organic",       intent_baseline: 65, reliability_score: 95.0, is_custom: false },
  { name: "Facebook Ads",         key: "facebook_ads",         intent_baseline: 35, reliability_score: 75.0, is_custom: false },
  { name: "Instagram Ads",        key: "instagram_ads",        intent_baseline: 30, reliability_score: 70.0, is_custom: false },
  { name: "LinkedIn Ads",         key: "linkedin_ads",         intent_baseline: 50, reliability_score: 85.0, is_custom: false },
  { name: "Website Contact Form", key: "website_contact_form", intent_baseline: 65, reliability_score: 92.0, is_custom: false },
  { name: "Website Chat",         key: "website_chat",         intent_baseline: 70, reliability_score: 93.0, is_custom: false },
  { name: "Referral",             key: "referral",             intent_baseline: 75, reliability_score: 96.0, is_custom: false },
  { name: "WhatsApp Business",    key: "whatsapp_business",    intent_baseline: 60, reliability_score: 88.0, is_custom: false },
  { name: "JustDial",             key: "justdial",             intent_baseline: 50, reliability_score: 80.0, is_custom: false },
  { name: "IndiaMART",            key: "indiamart",            intent_baseline: 60, reliability_score: 85.0, is_custom: false },
  { name: "Cold Call Outbound",   key: "cold_call_outbound",   intent_baseline: 20, reliability_score: 65.0, is_custom: false },
  { name: "Exhibition / Event",   key: "exhibition_event",     intent_baseline: 55, reliability_score: 82.0, is_custom: false },
  { name: "Walk-in",              key: "walk_in",              intent_baseline: 70, reliability_score: 90.0, is_custom: false },
  { name: "Re-inquiry",           key: "re_inquiry",           intent_baseline: 50, reliability_score: 82.0, is_custom: false },
  { name: "Partner / Reseller",   key: "partner_reseller",     intent_baseline: 65, reliability_score: 88.0, is_custom: false },
  { name: "Other",                key: "other",                intent_baseline: 10, reliability_score: 50.0, is_custom: false },
]

/** A slug from a workspace name: lowercase, alnum + dashes. */
export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace"
}

/** Seed the default pipeline stages + lead sources into a workspace. */
export async function provisionWorkspaceDefaults(
  tx: Prisma.TransactionClient,
  { accountId, workspaceId }: { accountId: string; workspaceId: string },
) {
  await tx.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, account_id: accountId, workspace_id: workspaceId })),
    skipDuplicates: true,
  })
  await tx.leadSource.createMany({
    data: DEFAULT_LEAD_SOURCES.map((s) => ({ ...s, account_id: accountId, workspace_id: workspaceId })),
    skipDuplicates: true,
  })
}
