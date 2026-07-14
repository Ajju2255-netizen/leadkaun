import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { computeFitScore } from "@/lib/scoring/fit-score"
import { computeQualityScore } from "@/lib/scoring/quality-score"
import { assignGrade } from "@/lib/scoring/grade"
import { scoreNotesIntent, getNotesGradeOverride } from "@/lib/scoring/notes-intent"
import { mapCityToState, inferIndustry } from "@/lib/import/enrich-lead"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/score-debug?leadId=xxx
 *
 * Returns the full scoring breakdown for a single lead (or last 5).
 * Shows raw DB values, computed scores, override result, and final grade.
 * Admin/Manager only.
 */
export async function GET(req: Request) {
  try {
    const session = await requireWorkspace()
    if (session.user.role === "REP") {
      return apiError("Forbidden", "FORBIDDEN", 403)
    }

    const url    = new URL(req.url)
    const leadId = url.searchParams.get("leadId")

    const leads = leadId
      ? await prisma.lead.findMany({
          where:   { id: leadId, account_id: session.account.id, workspace_id: session.workspace.id },
          include: { source: true, signals: { select: { signal_type: true, signal_value: true } } },
          take:    1,
        })
      : await prisma.lead.findMany({
          where:   { account_id: session.account.id, workspace_id: session.workspace.id },
          include: { source: true, signals: { select: { signal_type: true, signal_value: true } } },
          orderBy: { imported_at: "desc" },
          take:    5,
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
      const hasActivity = lead.signals.some((s) => s.signal_type !== "SOURCE_BASELINE")

      const notesBoost  = scoreNotesIntent(lead.inquiry_text)
      const rawIntent   = lead.signals.reduce((acc, s) => acc + s.signal_value, lead.source.intent_baseline)
        + notesBoost
      const baseIntent  = Math.min(100, Math.max(Math.max(lead.source.intent_baseline, 10), rawIntent))
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
      const override      = getNotesGradeOverride(lead.inquiry_text)
      const finalGrade    = override?.grade ?? computedGrade

      return {
        id:   lead.id,
        name: `${lead.first_name} ${lead.last_name ?? ""}`.trim(),

        // ── RAW DB VALUES ──────────────────────────────────────────────────────
        raw: {
          inquiry_text:   lead.inquiry_text,   // ← THIS IS THE KEY FIELD
          grade_in_db:    lead.grade,
          intent_in_db:   lead.intent_score,
          fit_in_db:      lead.fit_score,
          quality_in_db:  lead.quality_score,
        },

        // ── COMPUTED SCORES ────────────────────────────────────────────────────
        computed: {
          notes_boost:    notesBoost,
          base_intent:    baseIntent,
          intent_score:   intentScore,
          fit_score:      fitResult.total,
          quality_score:  qualityResult.total,
          pre_execution:  !hasActivity,
          computed_grade: computedGrade,
        },

        // ── OVERRIDE RESULT ────────────────────────────────────────────────────
        override: override,           // null if no keyword matched
        final_grade: finalGrade,      // grade that WOULD be saved on next regrade

        fit_breakdown:     fitResult.breakdown,
        quality_breakdown: qualityResult.breakdown,

        source: {
          key:               lead.source.key,
          intent_baseline:   lead.source.intent_baseline,
          reliability_score: lead.source.reliability_score,
        },

        signals: lead.signals,
      }
    })

    return apiSuccess({ results, icp: account })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
