import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/lead-sources
 *
 * Returns all lead sources for the current account.
 */
export async function GET() {
  try {
    const session = await requireWorkspace()

    let sources = await prisma.leadSource.findMany({
      where:   { account_id: session.account.id, workspace_id: session.workspace.id },
      orderBy: { name: "asc" },
      select:  { id: true, name: true, key: true, intent_baseline: true, is_custom: true },
    })

    // Auto-seed default sources for accounts created before this fix (legacy accounts)
    if (sources.length === 0) {
      const defaults = [
        { name: "Google Ads",           key: "google_ads",           intent_baseline: 55, reliability_score: 90.0,  is_custom: false },
        { name: "Google Organic SEO",   key: "google_organic",       intent_baseline: 65, reliability_score: 95.0,  is_custom: false },
        { name: "Facebook Ads",         key: "facebook_ads",         intent_baseline: 35, reliability_score: 75.0,  is_custom: false },
        { name: "Instagram Ads",        key: "instagram_ads",        intent_baseline: 30, reliability_score: 70.0,  is_custom: false },
        { name: "Website Contact Form", key: "website_contact_form", intent_baseline: 65, reliability_score: 92.0,  is_custom: false },
        { name: "Referral",             key: "referral",             intent_baseline: 75, reliability_score: 96.0,  is_custom: false },
        { name: "WhatsApp Business",    key: "whatsapp_business",    intent_baseline: 60, reliability_score: 88.0,  is_custom: false },
        { name: "JustDial",             key: "justdial",             intent_baseline: 50, reliability_score: 80.0,  is_custom: false },
        { name: "IndiaMART",            key: "indiamart",            intent_baseline: 60, reliability_score: 85.0,  is_custom: false },
        { name: "Exhibition / Event",   key: "exhibition_event",     intent_baseline: 55, reliability_score: 82.0,  is_custom: false },
        { name: "Walk-in",              key: "walk_in",              intent_baseline: 70, reliability_score: 90.0,  is_custom: false },
        { name: "Cold Call Outbound",   key: "cold_call_outbound",   intent_baseline: 20, reliability_score: 65.0,  is_custom: false },
        { name: "Other",                key: "other",                intent_baseline: 10, reliability_score: 50.0,  is_custom: false },
      ]
      await prisma.leadSource.createMany({
        data:           defaults.map((s) => ({ ...s, account_id: session.account.id, workspace_id: session.workspace.id })),
        skipDuplicates: true,
      })
      sources = await prisma.leadSource.findMany({
        where:   { account_id: session.account.id, workspace_id: session.workspace.id },
        orderBy: { name: "asc" },
        select:  { id: true, name: true, key: true, intent_baseline: true, is_custom: true },
      })
    }

    return apiSuccess({ sources })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

const CreateSchema = z.object({
  name:            z.string().min(1).max(80),
  intent_baseline: z.number().int().min(0).max(100).optional().default(30),
})

/**
 * POST /api/lead-sources
 * Create a custom lead source. Admin only.
 */
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace("ADMIN")

    const _rl = await rateLimited(`lead-sources:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const { data, error } = await parseBody(req, CreateSchema)
    if (error) return error

    const key = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")

    // Ensure key is unique within the account
    const existing = await prisma.leadSource.findFirst({
      where: { account_id: session.account.id, workspace_id: session.workspace.id, key },
    })
    const finalKey = existing ? `${key}_${Date.now()}` : key

    const source = await prisma.leadSource.create({
      data: {
        account_id:       session.account.id,
        name:             data.name,
        key:              finalKey,
        intent_baseline:  data.intent_baseline,
        reliability_score: 70.0,
        is_custom:        true,
      },
      select: { id: true, name: true, key: true, intent_baseline: true, is_custom: true },
    })

    return apiSuccess({ source }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
