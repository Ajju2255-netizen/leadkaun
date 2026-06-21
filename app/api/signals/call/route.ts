import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"
import { SIGNAL_WEIGHTS } from "@/lib/scoring/signal-weights"
import { applyAutoStage } from "@/lib/pipeline/auto-stage"
import { scheduleFollowUp } from "@/lib/follow-ups/schedule"
import { dispatchScoreAlerts } from "@/lib/realtime/score-alerts"
import { sendSqlAlertEmail } from "@/lib/email/lead-alerts"
import type { SignalType } from "@prisma/client"

const CALL_SIGNAL_TYPES = [
  "CALL_ANSWERED_INTERESTED",
  "CALL_ANSWERED_NOT_INTERESTED",
  "CALL_ANSWERED_CALLBACK",
  "CALL_ANSWERED_WRONG_NUMBER",
  "CALL_NOT_ANSWERED",
  "CALL_BUSY",
  "CALL_INVALID",
  "CALL_VOICEMAIL",
] as const

const CallSignalSchema = z.object({
  lead_id:     z.string().min(1),
  signal_type: z.enum(CALL_SIGNAL_TYPES),
  note:        z.string().optional().nullable(),
  duration_s:  z.number().int().nonnegative().optional().nullable(), // call duration in seconds
})

/**
 * POST /api/signals/call
 * Log a call outcome, write a Signal, recompute scores.
 * Also records speed_to_lead_hours on first contact.
 */
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace()

    const limited = await rateLimited(`signal:${session.user.id}`, LIMITS.heavyWrite)
    if (limited) return limited

    const { data, error } = await parseBody(req, CallSignalSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: {
        id:         data.lead_id,
        account_id: session.account.id, workspace_id: session.workspace.id,
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
      include: {
        stage: true,
        assigned_rep: { select: { email: true, first_name: true } },
      },
    })
    if (!lead) return NOT_FOUND("Lead")

    const signalType = data.signal_type as SignalType
    const signalValue = SIGNAL_WEIGHTS[signalType]

    const result = await prisma.$transaction(async (tx) => {
      // Capture current scores before update
      const intentBefore = lead.intent_score

      // Write the signal
      await tx.signal.create({
        data: {
          account_id:           session.account.id,
          lead_id:              data.lead_id,
          user_id:              session.user.id,
          signal_type:          signalType,
          signal_value:         signalValue,
          raw_value:            {
            note:       data.note,
            duration_s: data.duration_s,
          },
          lead_grade_at_signal: lead.grade,
          intent_score_before:  intentBefore,
          intent_score_after:   Math.min(100, Math.max(0, intentBefore + signalValue)),
        },
      })

      // Write note if provided
      if (data.note) {
        await tx.leadNote.create({
          data: {
            lead_id: data.lead_id,
            user_id: session.user.id,
            content: `Call (${signalType.replace("CALL_", "").replace(/_/g, " ").toLowerCase()}): ${data.note}`,
          },
        })
      }

      // Record speed-to-lead on first contact
      const isFirstContact = !lead.first_contact_at
      if (isFirstContact) {
        const hoursToContact =
          (Date.now() - lead.imported_at.getTime()) / (1000 * 60 * 60)
        await tx.lead.update({
          where: { id: data.lead_id },
          data: {
            first_contact_at:    new Date(),
            speed_to_lead_hours: Math.round(hoursToContact * 10) / 10,
          },
        })
      }

      // Always track last action + clear missed flag (recovery path)
      await tx.lead.update({
        where: { id: data.lead_id },
        data:  { last_action_at: new Date(), is_missed: false },
      })

      // Fatigue check: 5+ non-positive call signals with no positive response → flag fatigued
      const NEGATIVE_CALL_TYPES: SignalType[] = [
        "CALL_NOT_ANSWERED", "CALL_BUSY", "CALL_ANSWERED_NOT_INTERESTED",
        "CALL_INVALID", "CALL_VOICEMAIL",
      ]
      const POSITIVE_CALL_TYPES: SignalType[] = [
        "CALL_ANSWERED_INTERESTED", "CALL_ANSWERED_CALLBACK",
      ]
      if (NEGATIVE_CALL_TYPES.includes(signalType)) {
        const recentSignals = await tx.signal.findMany({
          where: { lead_id: data.lead_id },
          orderBy: { created_at: "desc" },
          take: 10,
          select: { signal_type: true },
        })
        const hasPositive = recentSignals.some((s) =>
          POSITIVE_CALL_TYPES.includes(s.signal_type as SignalType)
        )
        const negativeCount = recentSignals.filter((s) =>
          NEGATIVE_CALL_TYPES.includes(s.signal_type as SignalType)
        ).length
        if (!hasPositive && negativeCount >= 5) {
          await tx.lead.update({
            where: { id: data.lead_id },
            data:  { is_fatigued: true },
          })
        }
      }

      // Auto-advance pipeline stage based on call outcome
      const CALL_POSITIVE: SignalType[] = ["CALL_ANSWERED_INTERESTED", "CALL_ANSWERED_CALLBACK"]
      const advanced = await applyAutoStage(lead, signalType, session.account.id, session.user.id, tx)

      // If stage didn't advance but signal is positive, schedule follow-up for current stage
      if (!advanced && CALL_POSITIVE.includes(signalType)) {
        await scheduleFollowUp(lead, lead.stage.key, tx)
      }

      // Recompute all scores
      return processSignalAndUpdateScores(data.lead_id, session.account.id, tx)
    })

    // After commit: push realtime toast to the assigned rep on SQL crossing /
    // grade drop (audit B3). `lead` is the pre-update snapshot; `result` is new.
    await dispatchScoreAlerts({
      assignedRepId: lead.assigned_rep_id,
      leadId:        lead.id,
      leadName:      `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
      companyName:   lead.company_name,
      previousGrade: lead.grade,
      newGrade:      result.grade,
      wasSql:        lead.is_sql,
      isSql:         result.is_sql,
      expectedValue: lead.expected_value,
      lastActionAt:  lead.last_action_at,
      importedAt:    lead.imported_at,
    })

    // Email the assigned rep when the lead just became SQL (audit B8).
    if (result.is_sql && !lead.is_sql && lead.assigned_rep) {
      await sendSqlAlertEmail({
        to:            lead.assigned_rep.email,
        recipientName: lead.assigned_rep.first_name,
        leadId:        lead.id,
        leadFirstName: lead.first_name,
        leadLastName:  lead.last_name,
        leadCompany:   lead.company_name,
        grade:         result.grade,
        fitScore:      result.fit_score,
        intentScore:   result.intent_score,
      })
    }

    return apiSuccess(result)
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
