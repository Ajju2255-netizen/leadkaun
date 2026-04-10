import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/lead-sources
 *
 * Returns all lead sources for the current account.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    let sources = await prisma.leadSource.findMany({
      where:   { account_id: session.account.id },
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
        data:           defaults.map((s) => ({ ...s, account_id: session.account.id })),
        skipDuplicates: true,
      })
      sources = await prisma.leadSource.findMany({
        where:   { account_id: session.account.id },
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
