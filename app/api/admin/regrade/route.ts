import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { computeFitScore } from "@/lib/scoring/fit-score"
import { computeQualityScore } from "@/lib/scoring/quality-score"
import { assignGrade } from "@/lib/scoring/grade"
import { scoreNotesIntent, getNotesGradeOverride } from "@/lib/scoring/notes-intent"
import { mapCityToState, inferIndustry } from "@/lib/import/enrich-lead"

export const maxDuration = 300

/**
 * POST /api/admin/regrade
 *
 * Re-runs the scoring pipeline for every active lead in the account.
 * Uses pre-execution mode for leads with no call/WA activity.
 * Admin/Manager only.
 */
export async function POST() {
  try {
    const session = await requireAuth()

    if (session.user.role === "REP") {
      return apiError("Only Admins and Managers can regrade leads", "FORBIDDEN", 403)
    }

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

    const leads = await prisma.lead.findMany({
      where: {
        account_id: session.account.id,
        is_junk:    false,
      },
      include: {
        source:  true,
        signals: { select: { signal_type: true, signal_value: true } },
      },
    })

    console.log(`[regrade] Found ${leads.length} leads to regrade for account ${session.account.id}`)

    let updated = 0
    let failed  = 0
    const sample: object[] = []  // first 5 leads — returned for debugging
    const distribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }

    for (const lead of leads) {
      try {
        const hasActivity = lead.signals.some((s) => s.signal_type !== "SOURCE_BASELINE")
        const rawIntent   = lead.signals.reduce((acc, s) => acc + s.signal_value, lead.source.intent_baseline)
          + scoreNotesIntent(lead.inquiry_text)
        const baseIntent  = Math.min(100, Math.max(Math.max(lead.source.intent_baseline, 10), rawIntent))
        // 2× multiplier for leads with any real signal — widens the A–E spread
        const intentScore = baseIntent > 20 ? Math.min(100, baseIntent * 2) : baseIntent

        const fitResult = computeFitScore({
          lead: {
            industry:       inferIndustry(lead.company_name) ?? undefined,
            state:          lead.state ?? mapCityToState(lead.city) ?? undefined,
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

        const computedGrade = assignGrade(fitResult.total, intentScore, qualityResult.total, !hasActivity)

        // Hard override: notes keywords win over threshold math
        const notesText   = (lead.inquiry_text || "").toLowerCase()
        const override    = getNotesGradeOverride(lead.inquiry_text)
        const grade       = override?.grade       ?? computedGrade
        const finalIntent = override?.intentScore ?? intentScore

        console.log(`[override:${lead.id}] notes="${notesText}" computedGrade=${computedGrade} override=${JSON.stringify(override)} finalGrade=${grade}`)

        const scoreLog = {
          id:            lead.id,
          name:          `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
          phone:         lead.phone,
          inquiry_text:  lead.inquiry_text,   // raw notes — visible in regrade response sample
          fit_score:     fitResult.total,
          quality_score: qualityResult.total,
          intent_score:  finalIntent,
          pre_execution: !hasActivity,
          grade,
          override:      override ?? null,
          fit_breakdown: fitResult.breakdown,
        }
        console.log(`[regrade:${lead.id}]`, scoreLog)
        if (sample.length < 5) sample.push(scoreLog)

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            grade,
            fit_score:               fitResult.total,
            intent_score:            finalIntent,
            quality_score:           qualityResult.total,
            fit_score_breakdown:     fitResult.breakdown as object,
            quality_score_breakdown: qualityResult.breakdown as object,
          },
        })
        distribution[grade] = (distribution[grade] ?? 0) + 1
        updated++
      } catch (err) {
        console.error(`[regrade] FAILED lead ${lead.id}:`, String(err))
        failed++
      }
    }

    console.log(`[regrade] Grade distribution for account ${session.account.id}:`, distribution)
    console.log(`[regrade] Summary: updated=${updated}, failed=${failed}, total=${leads.length}`)

    return apiSuccess({ updated, failed, total: leads.length, sample, distribution })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
