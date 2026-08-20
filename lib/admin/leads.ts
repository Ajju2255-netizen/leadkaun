// ─────────────────────────────────────────────
// LEAD EXPLORER + LEAD INSPECTOR (Mission Control)
//
// The support workhorse. When a customer says "Leadkaun gave this lead a bad
// recommendation", this is where you reconstruct the whole story:
//
//   Lead → Score → Evidence → Recommendation → Why → Rep response → Outcome
//
// The inspector shows exactly what the customer sees (the same
// buildScoreExplanation / buildRecommendationExplanation the product renders)
// AND the technical layer underneath: the raw breakdown JSON, every signal with
// its before/after intent, the ICP the fit was judged against, and a LIVE
// recomputation so you can tell "the stored grade is stale" apart from "the
// engine is wrong".
//
// Read-only. Nothing in this file mutates a lead.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { buildScoreExplanation, type ScoreExplanation } from "@/lib/scoring/explain"
import { computeConfidence, type ConfidenceResult } from "@/lib/scoring/confidence"
import { computeFreshness, type FreshnessResult } from "@/lib/scoring/freshness"
import { computeAiScore } from "@/lib/scoring/ai-score"
import { getNextAction, type NextAction } from "@/lib/scoring/next-action"
import { computeFitScore } from "@/lib/scoring/fit-score"
import { computeQualityScore } from "@/lib/scoring/quality-score"
import { assignGrade, checkSqlThreshold } from "@/lib/scoring/grade"
import { mapCityToState, inferIndustry } from "@/lib/import/enrich-lead"
import { ACTIVE_LEAD } from "@/lib/billing/lead-usage"
import type { LeadGrade, Prisma, SignalType } from "@prisma/client"

// ── List ──────────────────────────────────────────────────────────────────────

export type LeadRow = {
  id: string
  name: string
  phone: string
  email: string | null
  company: string | null
  accountId: string
  accountName: string
  workspaceId: string | null
  grade: LeadGrade
  fit: number
  intent: number
  quality: number
  aiScore: number
  isSql: boolean
  isJunk: boolean
  isMissed: boolean
  isDuplicate: boolean
  wonAt: Date | null
  lostAt: Date | null
  sourceName: string
  repName: string | null
  importedAt: Date
  lastActionAt: Date | null
}

export type LeadFilters = {
  q?: string
  accountId?: string
  workspaceId?: string
  grade?: LeadGrade
  /** sql · junk · missed · duplicate · won · lost · open */
  flag?: string
  sourceKey?: string
  sort?: "recent" | "score" | "grade" | "value"
  take?: number
}

export async function listLeads(f: LeadFilters = {}): Promise<{ rows: LeadRow[]; truncated: boolean }> {
  // Soft-deleted records leave the admin lists by default. Nothing is erased —
  // the row is still there and Restore on the detail page brings it back.
  const where: Prisma.LeadWhereInput = { deleted_at: null }
  if (f.accountId) where.account_id = f.accountId
  if (f.workspaceId) where.workspace_id = f.workspaceId
  if (f.grade) where.grade = f.grade

  switch (f.flag) {
    case "sql": where.is_sql = true; break
    case "junk": where.is_junk = true; break
    case "missed": where.is_missed = true; break
    case "duplicate": where.is_duplicate = true; break
    case "won": where.won_at = { not: null }; break
    case "lost": where.lost_at = { not: null }; break
    case "open": Object.assign(where, ACTIVE_LEAD); break
  }

  if (f.q) {
    const term = f.q.trim()
    const like = { contains: term, mode: "insensitive" as const }
    where.OR = [
      { first_name: like }, { last_name: like }, { company_name: like },
      { email: like }, { phone: { contains: term } }, { phone_raw: { contains: term } },
    ]
  }

  const take = Math.min(300, f.take ?? 100)
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    f.sort === "grade" ? [{ grade: "asc" }, { intent_score: "desc" }]
    : f.sort === "value" ? [{ expected_value: "desc" }]
    : f.sort === "score" ? [{ intent_score: "desc" }, { fit_score: "desc" }]
    : [{ imported_at: "desc" }]

  const leads = await prisma.lead.findMany({
    where, orderBy, take: take + 1,
    select: {
      id: true, first_name: true, last_name: true, phone: true, email: true, company_name: true,
      account_id: true, workspace_id: true, grade: true,
      fit_score: true, intent_score: true, quality_score: true,
      is_sql: true, is_junk: true, is_missed: true, is_duplicate: true,
      won_at: true, lost_at: true, imported_at: true, last_action_at: true,
      account: { select: { name: true } },
      source: { select: { name: true } },
      assigned_rep: { select: { first_name: true, last_name: true } },
    },
  })

  const truncated = leads.length > take
  const rows = leads.slice(0, take).map((l) => ({
    id: l.id,
    name: `${l.first_name} ${l.last_name ?? ""}`.trim(),
    phone: l.phone,
    email: l.email,
    company: l.company_name,
    accountId: l.account_id,
    accountName: l.account.name,
    workspaceId: l.workspace_id,
    grade: l.grade,
    fit: l.fit_score,
    intent: l.intent_score,
    quality: l.quality_score,
    aiScore: computeAiScore({ fit: l.fit_score, intent: l.intent_score, quality: l.quality_score }),
    isSql: l.is_sql,
    isJunk: l.is_junk,
    isMissed: l.is_missed,
    isDuplicate: l.is_duplicate,
    wonAt: l.won_at,
    lostAt: l.lost_at,
    sourceName: l.source.name,
    repName: l.assigned_rep ? `${l.assigned_rep.first_name} ${l.assigned_rep.last_name ?? ""}`.trim() : null,
    importedAt: l.imported_at,
    lastActionAt: l.last_action_at,
  }))

  // "score" means the blended queue ranking, which isn't a DB column.
  if (f.sort === "score") rows.sort((a, b) => b.aiScore - a.aiScore)

  return { rows, truncated }
}

// ── Inspector ─────────────────────────────────────────────────────────────────

export type EvidenceEntry = {
  at: Date
  kind: "score" | "signal" | "note" | "recommendation" | "stage" | "followup"
  title: string
  detail: string | null
  /** Extra technical context shown in the admin-only column. */
  meta: string | null
  actor: string | null
}

export type LiveRecompute = {
  fit: number
  quality: number
  intentStored: number
  grade: LeadGrade
  isSql: boolean
  /** True when the stored grade differs from what the engine would produce now. */
  drifted: boolean
  fitBreakdown: Record<string, number>
  qualityBreakdown: Record<string, number>
  preExecution: boolean
  inferredIndustry: string | null
  inferredState: string | null
}

export type LeadInspector = {
  lead: {
    id: string
    name: string
    phone: string
    phoneRaw: string
    email: string | null
    company: string | null
    designation: string | null
    city: string | null
    state: string | null
    inquiryText: string | null
    expectedValue: number | null
    grade: LeadGrade
    previousGrade: LeadGrade | null
    gradeChangedAt: Date | null
    fit: number
    intent: number
    quality: number
    aiScore: number
    intentBaseline: number
    isSql: boolean
    sqlCrossedAt: Date | null
    isJunk: boolean
    junkFlags: string[]
    isMissed: boolean
    missedAt: Date | null
    isFatigued: boolean
    isDuplicate: boolean
    waStage: string
    importedAt: Date
    sourceCollectedAt: Date | null
    firstContactAt: Date | null
    speedToLeadHours: number | null
    firstActionRank: number | null
    lastActionAt: Date | null
    wonAt: Date | null
    lostAt: Date | null
    wonValue: number | null
    winReason: string | null
    lossReason: string | null
    deletedAt: Date | null
  }
  account: { id: string; name: string }
  workspaceName: string | null
  rep: { id: string; name: string } | null
  source: { name: string; key: string; intentBaseline: number; reliability: number }
  stage: { name: string; enteredAt: Date; reason: string | null }
  importJobId: string | null
  intakeSessionId: string | null

  /** Exactly what the customer sees. */
  explanation: ScoreExplanation
  confidence: ConfidenceResult
  freshness: FreshnessResult
  nextAction: NextAction

  /** Admin-only technical layer. */
  live: LiveRecompute
  icp: {
    configured: boolean
    industries: string[]
    states: string[]
    businessTypes: string[]
    roles: string[]
    budgetMin: number | null
    budgetMax: number | null
    salesCycle: string
    sqlFitThreshold: number
    sqlIntentThreshold: number
  }
  rawBreakdowns: { fit: unknown; quality: unknown }
  signals: { id: string; type: SignalType; value: number; before: number; after: number; gradeAt: LeadGrade; at: Date; actor: string | null }[]
  recommendationEvents: { id: string; event: string; actionLabel: string | null; gradeAtEvent: string | null; confidenceBand: string | null; skipReason: string | null; detail: unknown; at: Date; actor: string | null }[]
  evidence: EvidenceEntry[]
}

export async function getLeadInspector(leadId: string): Promise<LeadInspector | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      account: true,
      source: true,
      stage: { select: { name: true } },
      assigned_rep: { select: { id: true, first_name: true, last_name: true } },
    },
  })
  if (!lead) return null

  const [workspace, signals, scoreEvents, notes, recoEvents, stageHistory, followUps, intake] = await Promise.all([
    lead.workspace_id
      ? prisma.workspace.findUnique({ where: { id: lead.workspace_id }, select: { name: true } })
      : Promise.resolve(null),
    prisma.signal.findMany({
      where: { lead_id: leadId },
      orderBy: { created_at: "asc" },
      include: { user: { select: { first_name: true, last_name: true } } },
    }),
    prisma.leadScoreEvent.findMany({ where: { lead_id: leadId }, orderBy: { occurred_at: "asc" } }),
    prisma.leadNote.findMany({
      where: { lead_id: leadId },
      orderBy: { created_at: "asc" },
      include: { user: { select: { first_name: true, last_name: true } } },
    }),
    prisma.recommendationEvent.findMany({ where: { lead_id: leadId }, orderBy: { created_at: "asc" } }),
    prisma.stageHistory.findMany({ where: { lead_id: leadId }, orderBy: { created_at: "asc" } }),
    prisma.followUpAction.findMany({ where: { lead_id: leadId }, orderBy: { created_at: "asc" } }),
    lead.import_job_id
      ? prisma.intakeSession.findFirst({ where: { import_job_id: lead.import_job_id }, select: { id: true } })
      : Promise.resolve(null),
  ])

  // Names for recommendation-event actors (the table stores only user_id).
  const recoUserIds = Array.from(new Set(recoEvents.map((r) => r.user_id).filter((v): v is string => !!v)))
  const recoUsers = recoUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: recoUserIds } }, select: { id: true, first_name: true, last_name: true } })
    : []
  const recoUserName = new Map(recoUsers.map((u) => [u.id, `${u.first_name} ${u.last_name ?? ""}`.trim()]))

  // ── Live recomputation: what the engine would produce right now ──
  const inferredIndustry = inferIndustry(lead.company_name) ?? null
  const inferredState = lead.state ?? mapCityToState(lead.city) ?? null
  const fitResult = computeFitScore({
    lead: {
      industry: inferredIndustry ?? undefined,
      state: inferredState ?? undefined,
      city: lead.city ?? undefined,
      company_name: lead.company_name ?? undefined,
      designation: lead.designation ?? undefined,
      expected_value: lead.expected_value ?? undefined,
    },
    icp: lead.account,
  })
  const qualityResult = computeQualityScore({
    phone: lead.phone,
    email: lead.email,
    company_name: lead.company_name,
    inquiry_text: lead.inquiry_text,
    source_reliability: lead.source.reliability_score,
    junk_flags: lead.junk_flags,
    is_junk: lead.is_junk,
  })
  // Import-time signals don't count as execution — mirrors lib/scoring/grade.ts.
  const preExecution = !signals.some(
    (s) => s.signal_type !== "SOURCE_BASELINE" && !s.signal_type.startsWith("IMPORT_"),
  )
  const liveGrade = assignGrade(fitResult.total, lead.intent_score, qualityResult.total, preExecution)
  const liveSql = checkSqlThreshold(
    fitResult.total, lead.intent_score,
    lead.account.sql_fit_threshold, lead.account.sql_intent_threshold,
  )

  const explanation = buildScoreExplanation({
    grade: lead.grade,
    fit_score: lead.fit_score,
    intent_score: lead.intent_score,
    quality_score: lead.quality_score,
    fit_score_breakdown: lead.fit_score_breakdown,
    quality_score_breakdown: lead.quality_score_breakdown,
  })

  const confidence = computeConfidence({
    first_name: lead.first_name, phone: lead.phone, email: lead.email,
    company_name: lead.company_name, designation: lead.designation,
    city: lead.city, state: lead.state,
    expected_value: lead.expected_value, inquiry_text: lead.inquiry_text,
  })

  // Freshness is about how old the DATA is, not how recently a rep touched it —
  // it deliberately takes only the collection/import dates.
  const freshness = computeFreshness({
    imported_at: lead.imported_at,
    source_collected_at: lead.source_collected_at,
  })

  const name = (u: { first_name: string; last_name: string | null } | null) =>
    u ? `${u.first_name} ${u.last_name ?? ""}`.trim() : null

  // ── One merged evidence timeline ──
  const evidence: EvidenceEntry[] = [
    ...scoreEvents.map((e) => ({
      at: e.occurred_at,
      kind: "score" as const,
      title: e.summary,
      detail: `Grade ${e.grade} · fit ${e.fit_score} · intent ${e.intent_score} · quality ${e.quality_score}`,
      meta: `${e.kind} · confidence ${e.confidence}`,
      actor: null,
    })),
    ...signals.map((s) => ({
      at: s.created_at,
      kind: "signal" as const,
      title: s.signal_type.replace(/_/g, " "),
      detail: `${s.signal_value > 0 ? "+" : ""}${s.signal_value} intent`,
      meta: `intent ${s.intent_score_before} → ${s.intent_score_after} · grade at signal ${s.lead_grade_at_signal}`,
      actor: name(s.user),
    })),
    ...notes.map((n) => ({
      at: n.created_at, kind: "note" as const, title: "Note", detail: n.content, meta: null, actor: name(n.user),
    })),
    ...recoEvents.map((r) => ({
      at: r.created_at,
      kind: "recommendation" as const,
      title: `Recommendation ${r.event}`,
      detail: r.action_label,
      meta: [
        r.grade_at_event && `grade ${r.grade_at_event}`,
        r.confidence_band && `confidence ${r.confidence_band}`,
        r.skip_reason && `reason ${r.skip_reason}`,
      ].filter(Boolean).join(" · ") || null,
      actor: r.user_id ? recoUserName.get(r.user_id) ?? null : null,
    })),
    ...stageHistory.map((s) => ({
      at: s.created_at, kind: "stage" as const, title: "Stage moved", detail: s.note,
      meta: `${s.from_stage_id ?? "—"} → ${s.to_stage_id}`, actor: null,
    })),
    ...followUps.map((a) => ({
      at: a.created_at, kind: "followup" as const,
      title: `Follow-up ${a.status.toLowerCase()}`,
      detail: `${a.action_type} · day ${a.day_number}`,
      meta: `due ${a.due_date.toISOString()}${a.is_overdue ? " · overdue" : ""}`,
      actor: null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())

  return {
    lead: {
      id: lead.id,
      name: `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
      phone: lead.phone,
      phoneRaw: lead.phone_raw,
      email: lead.email,
      company: lead.company_name,
      designation: lead.designation,
      city: lead.city,
      state: lead.state,
      inquiryText: lead.inquiry_text,
      expectedValue: lead.expected_value,
      grade: lead.grade,
      previousGrade: lead.previous_grade,
      gradeChangedAt: lead.grade_changed_at,
      fit: lead.fit_score,
      intent: lead.intent_score,
      quality: lead.quality_score,
      aiScore: computeAiScore({ fit: lead.fit_score, intent: lead.intent_score, quality: lead.quality_score }),
      intentBaseline: lead.intent_score_baseline,
      isSql: lead.is_sql,
      sqlCrossedAt: lead.sql_crossed_at,
      isJunk: lead.is_junk,
      junkFlags: lead.junk_flags,
      isMissed: lead.is_missed,
      missedAt: lead.missed_at,
      isFatigued: lead.is_fatigued,
      isDuplicate: lead.is_duplicate,
      waStage: lead.wa_conversation_stage,
      importedAt: lead.imported_at,
      sourceCollectedAt: lead.source_collected_at,
      firstContactAt: lead.first_contact_at,
      speedToLeadHours: lead.speed_to_lead_hours,
      firstActionRank: lead.first_action_rank,
      lastActionAt: lead.last_action_at,
      wonAt: lead.won_at,
      lostAt: lead.lost_at,
      wonValue: lead.won_value,
      winReason: lead.win_reason,
      lossReason: lead.loss_reason,
      deletedAt: lead.deleted_at ?? null,
    },
    account: { id: lead.account.id, name: lead.account.name },
    workspaceName: workspace?.name ?? null,
    rep: lead.assigned_rep ? { id: lead.assigned_rep.id, name: name(lead.assigned_rep) ?? "" } : null,
    source: {
      name: lead.source.name, key: lead.source.key,
      intentBaseline: lead.source.intent_baseline, reliability: lead.source.reliability_score,
    },
    stage: { name: lead.stage.name, enteredAt: lead.stage_entered_at, reason: lead.stage_reason },
    importJobId: lead.import_job_id,
    intakeSessionId: intake?.id ?? null,
    explanation,
    confidence,
    freshness,
    nextAction: getNextAction(lead.grade),
    live: {
      fit: fitResult.total,
      quality: qualityResult.total,
      intentStored: lead.intent_score,
      grade: liveGrade,
      isSql: liveSql,
      drifted: liveGrade !== lead.grade,
      fitBreakdown: fitResult.breakdown as unknown as Record<string, number>,
      qualityBreakdown: qualityResult.breakdown as unknown as Record<string, number>,
      preExecution,
      inferredIndustry,
      inferredState,
    },
    icp: {
      configured: lead.account.icp_configured,
      industries: lead.account.icp_industries,
      states: lead.account.icp_states,
      businessTypes: lead.account.icp_business_types,
      roles: lead.account.icp_roles,
      budgetMin: lead.account.icp_budget_min,
      budgetMax: lead.account.icp_budget_max,
      salesCycle: lead.account.icp_sales_cycle,
      sqlFitThreshold: lead.account.sql_fit_threshold,
      sqlIntentThreshold: lead.account.sql_intent_threshold,
    },
    rawBreakdowns: { fit: lead.fit_score_breakdown, quality: lead.quality_score_breakdown },
    signals: signals.map((s) => ({
      id: s.id, type: s.signal_type, value: s.signal_value,
      before: s.intent_score_before, after: s.intent_score_after,
      gradeAt: s.lead_grade_at_signal, at: s.created_at, actor: name(s.user),
    })),
    recommendationEvents: recoEvents.map((r) => ({
      id: r.id, event: r.event, actionLabel: r.action_label,
      gradeAtEvent: r.grade_at_event, confidenceBand: r.confidence_band,
      skipReason: r.skip_reason, detail: r.detail, at: r.created_at,
      actor: r.user_id ? recoUserName.get(r.user_id) ?? null : null,
    })),
    evidence,
  }
}
