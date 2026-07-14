import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { getNextAction, buildActionReason } from "@/lib/scoring/next-action"
import { recordScoreEvent, diffEnrichment } from "@/lib/scoring/score-events"
import { recomputeFitQualityGrade } from "@/lib/scoring/recompute"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

type Params = { params: { id: string } }

// ─────────────────────────────────────────────
// GET /api/leads/[id]
// Full lead record with signals, notes, follow-ups, stage history
// ─────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace()

    const lead = await prisma.lead.findFirst({
      where: {
        id:         params.id,
        account_id: session.account.id, workspace_id: session.workspace.id,
        // REP can only view their assigned leads
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
      include: {
        source:       { select: { id: true, name: true, key: true, intent_baseline: true } },
        stage:        { select: { id: true, name: true, key: true, is_terminal: true, is_won: true, is_lost: true } },
        assigned_rep: { select: { id: true, first_name: true, last_name: true, email: true } },
        signals: {
          orderBy: { created_at: "desc" },
          take: 50,
        },
        notes: {
          orderBy: { created_at: "desc" },
          include: { user: { select: { id: true, first_name: true, last_name: true } } },
        },
        follow_up_actions: {
          where:   { status: { in: ["PENDING", "OVERDUE"] } },
          orderBy: { due_date: "asc" },
        },
        stage_history: {
          orderBy: { created_at: "desc" },
          take: 20,
        },
      },
    })

    if (!lead) return NOT_FOUND("Lead")

    const action = getNextAction(lead.grade)
    return apiSuccess({
      ...lead,
      next_action: {
        ...action,
        reason: buildActionReason({
          grade:        lead.grade,
          fit_score:    lead.fit_score,
          intent_score: lead.intent_score,
          quality_score: lead.quality_score,
          inquiry_text: lead.inquiry_text,
        }),
      },
    })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ─────────────────────────────────────────────
// PATCH /api/leads/[id]
// Update editable fields on a lead
// ─────────────────────────────────────────────

const UpdateLeadSchema = z.object({
  first_name:      z.string().min(1).optional(),
  last_name:       z.string().optional().nullable(),
  email:           z.string().email().optional().nullable(),
  company_name:    z.string().optional().nullable(),
  designation:     z.string().optional().nullable(),
  city:            z.string().optional().nullable(),
  state:           z.string().optional().nullable(),
  pincode:         z.string().optional().nullable(),
  inquiry_text:    z.string().optional().nullable(),
  expected_value:  z.number().int().positive().optional().nullable(),
  custom_values:   z.record(z.string(), z.unknown()).optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace()

    const limited = await rateLimited(`lead-action:${session.user.id}`, LIMITS.write)
    if (limited) return limited

    const { data, error } = await parseBody(req, UpdateLeadSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: {
        id:         params.id,
        account_id: session.account.id, workspace_id: session.workspace.id,
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
    })
    if (!lead) return NOT_FOUND("Lead")

    const { custom_values, ...rest } = data
    const updated = await prisma.lead.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(custom_values !== undefined ? { custom_values: custom_values as object } : {}),
      },
    })

    // Score Evolution: if the edit added/changed data-quality fields, log an
    // ENRICHED timeline entry — and re-grade when scoring-relevant fields moved
    // (so "Company added" can lift fit/grade, not just confidence). Best-effort.
    try {
      const diff = diffEnrichment(lead, updated)
      if (diff.summary) {
        const SCORING_KEYS = ["company_name", "designation", "city", "state", "expected_value", "email", "inquiry_text"] as const
        const touchedScoring = SCORING_KEYS.some((k) => k in data)
        let snap = updated

        if (touchedScoring) {
          const [account, source, activityCount] = await Promise.all([
            prisma.account.findUnique({
              where: { id: session.account.id },
              select: { icp_configured: true, icp_industries: true, icp_states: true, icp_business_types: true, icp_roles: true, icp_budget_min: true, icp_budget_max: true },
            }),
            prisma.leadSource.findUnique({ where: { id: updated.source_id }, select: { reliability_score: true } }),
            prisma.signal.count({ where: { lead_id: updated.id, signal_type: { not: "SOURCE_BASELINE" } } }),
          ])
          if (account && source) {
            const rs = recomputeFitQualityGrade({
              lead: {
                company_name: updated.company_name, designation: updated.designation, city: updated.city, state: updated.state,
                expected_value: updated.expected_value, phone: updated.phone, email: updated.email, inquiry_text: updated.inquiry_text,
                junk_flags: updated.junk_flags as string[], is_junk: updated.is_junk,
              },
              icp: account, sourceReliability: source.reliability_score, intentScore: updated.intent_score, hasActivity: activityCount > 0,
            })
            const gradeChanged = rs.grade !== updated.grade
            snap = await prisma.lead.update({
              where: { id: updated.id },
              data: {
                fit_score: rs.fit_score, quality_score: rs.quality_score, grade: rs.grade,
                fit_score_breakdown: rs.fit_breakdown as object, quality_score_breakdown: rs.quality_breakdown as object,
                ...(gradeChanged ? { grade_changed_at: new Date(), previous_grade: updated.grade } : {}),
              },
            })
          }
        }

        await recordScoreEvent(prisma, {
          lead: {
            id: snap.id, account_id: snap.account_id, workspace_id: snap.workspace_id,
            grade: snap.grade, fit_score: snap.fit_score, intent_score: snap.intent_score, quality_score: snap.quality_score,
            first_name: snap.first_name, phone: snap.phone, email: snap.email, company_name: snap.company_name,
            designation: snap.designation, city: snap.city, state: snap.state, expected_value: snap.expected_value, inquiry_text: snap.inquiry_text,
          },
          kind: "ENRICHED",
          summary: diff.summary,
          detail: { fields_added: diff.fieldsAdded, fields_changed: diff.fieldsChanged },
        })
        return apiSuccess(snap)
      }
    } catch (e) {
      console.warn("[lead:enrich-event]", String(e))
    }

    return apiSuccess(updated)
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ─────────────────────────────────────────────
// DELETE /api/leads/[id]
// Admin only
// ─────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace("ADMIN")

    const lead = await prisma.lead.findFirst({
      where: { id: params.id, account_id: session.account.id, workspace_id: session.workspace.id },
    })
    if (!lead) return NOT_FOUND("Lead")

    await prisma.lead.delete({ where: { id: params.id } })
    return apiSuccess({ deleted: true })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
