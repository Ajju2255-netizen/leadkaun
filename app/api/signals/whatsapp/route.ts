import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"
import { SIGNAL_WEIGHTS } from "@/lib/scoring/signal-weights"
import { applyAutoStage } from "@/lib/pipeline/auto-stage"
import type { SignalType, WaStage } from "@prisma/client"

const WA_SIGNAL_TYPES = [
  "WA_REPLIED_1H",
  "WA_REPLIED_4H",
  "WA_REPLIED_24H",
  "WA_NO_REPLY",
  "WA_TAG_ASKED_PRICING",
  "WA_TAG_BROCHURE",
  "WA_TAG_NEGOTIATING",
  "WA_TAG_COMPARING",
  "WA_TAG_DECISION_PENDING",
  "WA_TAG_NOT_SERIOUS",
  "WA_TAG_GENERAL_CHAT",
  "WA_TAG_WRONG_NUMBER",
  "WA_STAGE_ADVANCED",
  "WA_STAGE_REGRESSED",
] as const

const WA_STAGES = ["INQUIRY", "DISCUSSION", "NEGOTIATION", "CLOSING", "STALLED"] as const

const WhatsappSignalSchema = z.object({
  lead_id:              z.string().min(1),
  signal_type:          z.enum(WA_SIGNAL_TYPES),
  conversation_stage:   z.enum(WA_STAGES).optional().nullable(),
  note:                 z.string().optional().nullable(),
  template_id:          z.string().optional().nullable(), // if a template was used
})

/**
 * POST /api/signals/whatsapp
 * Log a WhatsApp interaction, write a Signal, recompute scores.
 * Updates wa_conversation_stage if provided.
 */
export async function POST(req: Request) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, WhatsappSignalSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: {
        id:         data.lead_id,
        account_id: session.account.id,
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
      include: { stage: true },
    })
    if (!lead) return NOT_FOUND("Lead")

    const signalType = data.signal_type as SignalType
    const signalValue = SIGNAL_WEIGHTS[signalType]

    // Derive WA_STAGE_ADVANCED / WA_STAGE_REGRESSED from stage change
    const stageSignals: SignalType[] = []
    if (data.conversation_stage && data.conversation_stage !== lead.wa_conversation_stage) {
      const stages = WA_STAGES as unknown as string[]
      const prev = stages.indexOf(lead.wa_conversation_stage)
      const next = stages.indexOf(data.conversation_stage)
      if (next > prev) stageSignals.push("WA_STAGE_ADVANCED")
      else if (next < prev) stageSignals.push("WA_STAGE_REGRESSED")
    }

    const result = await prisma.$transaction(async (tx) => {
      const intentBefore = lead.intent_score

      // Write the primary WA signal
      await tx.signal.create({
        data: {
          account_id:           session.account.id,
          lead_id:              data.lead_id,
          user_id:              session.user.id,
          signal_type:          signalType,
          signal_value:         signalValue,
          raw_value:            {
            note:              data.note,
            template_id:       data.template_id,
            conversation_stage: data.conversation_stage,
          },
          lead_grade_at_signal: lead.grade,
          intent_score_before:  intentBefore,
          intent_score_after:   Math.min(100, Math.max(0, intentBefore + signalValue)),
        },
      })

      // Write stage change signals if conversation advanced/regressed
      for (const stageSignalType of stageSignals) {
        await tx.signal.create({
          data: {
            account_id:           session.account.id,
            lead_id:              data.lead_id,
            user_id:              session.user.id,
            signal_type:          stageSignalType,
            signal_value:         SIGNAL_WEIGHTS[stageSignalType],
            lead_grade_at_signal: lead.grade,
            intent_score_before:  intentBefore,
            intent_score_after:   intentBefore + SIGNAL_WEIGHTS[stageSignalType],
          },
        })
      }

      // Update WA conversation stage if provided
      if (data.conversation_stage) {
        await tx.lead.update({
          where: { id: data.lead_id },
          data: { wa_conversation_stage: data.conversation_stage as WaStage },
        })
      }

      // Write note if provided
      if (data.note) {
        await tx.leadNote.create({
          data: {
            lead_id: data.lead_id,
            user_id: session.user.id,
            content: `WhatsApp (${signalType.replace("WA_TAG_", "").replace("WA_", "").replace(/_/g, " ").toLowerCase()}): ${data.note}`,
          },
        })
      }

      // Record speed-to-lead on first contact
      if (!lead.first_contact_at) {
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

      // Auto-advance pipeline stage based on WA signal
      await applyAutoStage(lead, signalType, session.account.id, session.user.id, tx)

      return processSignalAndUpdateScores(data.lead_id, session.account.id, tx)
    })

    return apiSuccess(result)
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
