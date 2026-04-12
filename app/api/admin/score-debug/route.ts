import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { computeFitScore } from "@/lib/scoring/fit-score"
import { computeQualityScore } from "@/lib/scoring/quality-score"
import { assignGrade } from "@/lib/scoring/grade"

/**
 * GET /api/admin/score-debug?leadId=xxx
 *
 * Returns the full scoring breakdown for a single lead.
 * Admin/Manager only. Used to debug why leads are graded E.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth()
    if (session.user.role === "REP") {
      return apiError("Forbidden", "FORBIDDEN", 403)
    }

    const url = new URL(req.url)
    const leadId = url.searchParams.get("leadId")

    // If no leadId, return the first 3 leads with their score breakdown
    const leads = leadId
      ? await prisma.lead.findMany({
          where: { id: leadId, account_id: session.account.id },
          include: { source: true, signals: { select: { signal_type: true, signal_value: true } } },
          take: 1,
        })
      : await prisma.lead.findMany({
          where: { account_id: session.account.id },
          include: { source: true, signals: { select: { signal_type: true, signal_value: true } } },
          orderBy: { created_at: "desc" },
          take: 5,
        })

    const account = await prisma.account.findUniqueOrThrow({
      where: { id: session.account.id },
      select: {
        icp_configured:     true,
        icp_industries:     true,
        icp_states:         true,
        icp_business_types: true,
        icp_roles:          true,
        icp_budget_min:     true,
        icp_budget_max:     true,
      },
    })

    const results = leads.map((lead) => {
      const intentScore = Math.min(
        100,
        lead.signals.reduce((acc, s) => acc + s.signal_value, lead.source.intent_baseline),
      )

      const fitResult = computeFitScore({
        lead: {
          industry:       undefined,
          state:          lead.state ?? undefined,
          city:           lead.city ?? undefined,
          company_name:   lead.company_name ?? undefined,
          designation:    lead.designation ?? undefined,
          expected_value: lead.expected_value ?? undefined,
        },
        icp: account,
      })

      const qualityResult = computeQualityScore({
        phone:              lead.phone,
        email:              lead.email,
        company_name:       lead.company_name,
        inquiry_text:       lead.inquiry_text,
        source_reliability: lead.source.reliability_score,
        junk_flags:         lead.junk_flags as string[],
        is_junk:            lead.is_junk,
      })

      const newGrade = assignGrade(fitResult.total, intentScore, qualityResult.total)

      return {
        id:         lead.id,
        name:       `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
        phone:      lead.phone,
        stored_grade: lead.grade,
        computed_grade: newGrade,
        scores: {
          fit:     fitResult.total,
          intent:  intentScore,
          quality: qualityResult.total,
        },
        fit_breakdown:     fitResult.breakdown,
        quality_breakdown: qualityResult.breakdown,
        source: {
          key:               lead.source.key,
          intent_baseline:   lead.source.intent_baseline,
          reliability_score: lead.source.reliability_score,
        },
        icp: account,
        signals_count: lead.signals.length,
      }
    })

    return apiSuccess({ results })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
