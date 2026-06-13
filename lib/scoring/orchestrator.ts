import type { Prisma } from "@prisma/client"
import { computeFitScore } from "./fit-score"
import { computeIntentScore } from "./intent-score"
import { computeQualityScore } from "./quality-score"
import { assignGrade, checkSqlThreshold } from "./grade"
import { inferIndustry, mapCityToState } from "@/lib/import/enrich-lead"
import type { ScoringResult, SignalRecord } from "./types"

type TxClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

/**
 * Core scoring pipeline.
 *
 * Loads the lead + all its signals + account ICP config,
 * recomputes all three scores and grade, writes the result back,
 * and returns the new ScoringResult.
 *
 * Must be called inside a Prisma transaction so the caller controls atomicity.
 * TAD ref: Section 4.5.2
 */
export async function processSignalAndUpdateScores(
  leadId: string,
  accountId: string,
  tx: TxClient,
): Promise<ScoringResult> {
  // ── 1. Load lead with source and all signals ─────────────────────────────
  const lead = await tx.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      source: true,
      signals: {
        orderBy: { created_at: "desc" },
      },
    },
  })

  // ── 2. Load account (ICP config + SQL thresholds) ────────────────────────
  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    select: {
      icp_configured: true,
      icp_industries: true,
      icp_states: true,
      icp_business_types: true,
      icp_roles: true,
      icp_budget_min: true,
      icp_budget_max: true,
      icp_sales_cycle: true,
      sql_fit_threshold: true,
      sql_intent_threshold: true,
    },
  })

  // ── 3. Compute Fit Score ─────────────────────────────────────────────────
  const fitResult = computeFitScore({
    lead: {
      // Engine is the single source of truth: infer industry from company name
      // and fall back to city→state mapping for geography, exactly as the CSV
      // import does. This keeps import-time scoring identical to every later
      // recompute (audit B1/B2).
      industry:       inferIndustry(lead.company_name) ?? undefined,
      state:          lead.state ?? mapCityToState(lead.city) ?? undefined,
      city:           lead.city ?? undefined,
      company_name:   lead.company_name ?? undefined,
      designation:    lead.designation ?? undefined,
      expected_value: lead.expected_value ?? undefined,
    },
    icp: account,
  })

  // ── 4. Compute Intent Score ──────────────────────────────────────────────
  const signalRecords: SignalRecord[] = lead.signals.map((s) => ({
    signal_type:  s.signal_type,
    signal_value: s.signal_value,
    created_at:   s.created_at,
  }))

  const intentScore = computeIntentScore({
    signals:         signalRecords,
    source_baseline: lead.source.intent_baseline,
    sales_cycle:     account.icp_sales_cycle,
    imported_at:     lead.imported_at,
  })

  // ── 5. Compute Quality Score ─────────────────────────────────────────────
  const qualityResult = computeQualityScore({
    phone:               lead.phone,
    email:               lead.email,
    company_name:        lead.company_name,
    inquiry_text:        lead.inquiry_text,
    source_reliability:  lead.source.reliability_score,
    junk_flags:          lead.junk_flags,
    is_junk:             lead.is_junk,
  })

  // ── 6. Assign grade and check SQL threshold ──────────────────────────────
  // Pre-execution = the rep has not logged any real activity yet. Import-time
  // signals (SOURCE_BASELINE + IMPORT_*) don't count as execution; a CALL_*/WA_*
  // /REP_* signal does. Grading the same way at import and on recompute means a
  // lead's grade no longer silently shifts the moment the engine re-runs.
  const hasExecutionActivity = lead.signals.some(
    (s) => s.signal_type !== "SOURCE_BASELINE" && !String(s.signal_type).startsWith("IMPORT_"),
  )
  const newGrade = assignGrade(
    fitResult.total,
    intentScore,
    qualityResult.total,
    !hasExecutionActivity,
  )
  const isSql = checkSqlThreshold(
    fitResult.total,
    intentScore,
    account.sql_fit_threshold,
    account.sql_intent_threshold,
  )

  const gradeChanged = newGrade !== lead.grade

  // ── 7. Write updated scores back to the lead ─────────────────────────────
  await tx.lead.update({
    where: { id: leadId },
    data: {
      fit_score:               fitResult.total,
      intent_score:            intentScore,
      quality_score:           qualityResult.total,
      grade:                   newGrade,
      fit_score_breakdown:     fitResult.breakdown as object,
      quality_score_breakdown: qualityResult.breakdown as object,
      is_sql:                  isSql,
      sql_crossed_at:          isSql && !lead.is_sql ? new Date() : lead.sql_crossed_at,
      grade_changed_at:        gradeChanged ? new Date() : lead.grade_changed_at,
      previous_grade:          gradeChanged ? lead.grade : lead.previous_grade,
    },
  })

  return {
    fit_score:               fitResult.total,
    intent_score:            intentScore,
    quality_score:           qualityResult.total,
    grade:                   newGrade,
    is_sql:                  isSql,
    fit_score_breakdown:     fitResult.breakdown,
    quality_score_breakdown: qualityResult.breakdown,
  }
}
