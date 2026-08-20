import type { Prisma } from "@prisma/client"

import { SAMPLE_LEADS, samplePhone } from "./sample-data"

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

/* ── Sample workspace ────────────────────────────────────────────────────────
   A new account has nothing in it, so every screen reads as broken rather than
   empty. This seeds a second workspace with a realistic, already-graded pipeline
   so the product can be understood before the user has imported anything.

   Kept in its own workspace rather than in "Main" so it can be removed in one
   operation and can never mix with real leads. Everything customer-facing is
   workspace-scoped, so sample data stays where it is put. */

export const SAMPLE_WORKSPACE_SLUG = "sample"

/** Seed the Sample workspace: default stages + sources, then the demo leads. */
export async function provisionSampleWorkspace(
  tx: Prisma.TransactionClient,
  { accountId, userId }: { accountId: string; userId: string },
): Promise<string> {
  const ws = await tx.workspace.create({
    data: {
      account_id:  accountId,
      name:        "Sample",
      slug:        SAMPLE_WORKSPACE_SLUG,
      is_default:  false,
      description: "Example leads so you can see how Leadkaun works. Remove this any time.",
    },
  })
  await tx.workspaceMember.create({ data: { workspace_id: ws.id, user_id: userId } })
  await provisionWorkspaceDefaults(tx, { accountId, workspaceId: ws.id })

  const stages  = await tx.pipelineStage.findMany({ where: { workspace_id: ws.id }, orderBy: { display_order: "asc" } })
  const sources = await tx.leadSource.findMany({ where: { workspace_id: ws.id } })
  const stageBy = (key: string) => stages.find((s) => s.key === key) ?? stages[0]
  const sourceBy = (key: string) => sources.find((s) => s.key === key) ?? sources[0]
  if (!stages.length || !sources.length) return ws.id

  const now = Date.now()
  const daysAgo = (n: number) => new Date(now - n * 86_400_000)

  await tx.lead.createMany({
    data: SAMPLE_LEADS.map((l, i) => {
      // Dates are relative to signup, so the sample never looks stale.
      const base = {
        account_id:   accountId,
        workspace_id: ws.id,
        first_name:   l.first_name,
        last_name:    l.last_name,
        company_name: l.company_name === "—" ? null : l.company_name,
        city:         l.city,
        phone:        samplePhone(i),
        phone_raw:    samplePhone(i),
        source_id:    sourceBy(l.kind === "cold" ? "other" : l.kind === "won" ? "referral" : "website_contact_form").id,
        grade:        l.grade,
        fit_score:    l.fit,
        intent_score: l.intent,
        quality_score: l.quality,
        // Marker of last resort — workspace scoping is the real isolation.
        custom_values: { sample: true, note: l.note },
      }

      switch (l.kind) {
        case "won":
          return { ...base, stage_id: stageBy("won").id, won_at: daysAgo(3 + i), won_value: l.value ?? 0,
                   first_contact_at: daysAgo(10 + i), speed_to_lead_hours: 1.5 + (i % 4) }
        case "missed":
          // expected_value is what /api/analytics/missed sums into "₹ at risk"
          // (it reads `expected_value ?? 0`). Without it the sample's Missed
          // page showed ₹0 — the single sharpest hook in the fixture, and the
          // whole reason the sample exists, rendered as a zero.
          return { ...base, stage_id: stageBy("contacted").id, is_missed: true,
                   expected_value: l.value ?? 0,
                   missed_at: daysAgo(4 + (i % 5)), last_action_at: daysAgo(9 + (i % 6)),
                   first_contact_at: daysAgo(12 + i) }
        case "hot":
          return { ...base, stage_id: stageBy("new_inquiry").id, last_action_at: daysAgo(0) }
        case "working":
          return { ...base, stage_id: stageBy(i % 2 ? "qualified" : "proposal_sent").id,
                   expected_value: l.value ?? 0,
                   first_contact_at: daysAgo(2 + (i % 5)), last_action_at: daysAgo(1 + (i % 3)),
                   speed_to_lead_hours: 2 + (i % 6) }
        default:
          return { ...base, stage_id: stageBy("new_inquiry").id }
      }
    }),
    skipDuplicates: true,
  })

  return ws.id
}
