import type { SignalType, PrismaClient } from "@prisma/client"
import { scheduleFollowUp } from "@/lib/follow-ups/schedule"

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]

interface AutoTransition {
  key:    string  // target stage key
  reason: string  // human-readable reason stored in stage_reason
}

const SIGNAL_TO_STAGE: Partial<Record<SignalType, AutoTransition>> = {
  // Call signals
  CALL_ANSWERED_INTERESTED: { key: "contacted",   reason: "Call answered — lead showed interest"         },
  CALL_ANSWERED_CALLBACK:   { key: "contacted",   reason: "Lead requested a callback"                    },
  // WhatsApp reply signals
  WA_REPLIED_1H:            { key: "contacted",   reason: "Lead replied on WhatsApp within 1 hour"       },
  WA_REPLIED_4H:            { key: "contacted",   reason: "Lead replied on WhatsApp within 4 hours"      },
  WA_REPLIED_24H:           { key: "contacted",   reason: "Lead replied on WhatsApp within 24 hours"     },
  // WhatsApp intent signals
  WA_TAG_ASKED_PRICING:     { key: "qualified",   reason: "Lead asked for pricing — shows buying intent"  },
  WA_TAG_NEGOTIATING:       { key: "negotiation", reason: "Lead is actively negotiating"                 },
  WA_TAG_DECISION_PENDING:  { key: "negotiation", reason: "Lead is in decision-pending stage"            },
}

export async function applyAutoStage(
  lead: {
    id:              string
    account_id:      string
    stage_id:        string
    stage:           { key: string; display_order: number; is_terminal: boolean }
    assigned_rep_id: string | null
    won_at:          Date | null
    lost_at:         Date | null
    is_junk:         boolean
    is_missed:       boolean
  },
  signalType: SignalType,
  accountId:  string,
  userId:     string,
  tx:         Tx,
): Promise<boolean> {
  // Never move terminal (won/lost) leads
  if (lead.stage.is_terminal) return false

  const transition = SIGNAL_TO_STAGE[signalType]
  if (!transition) return false

  // Find the target stage for this account
  const targetStage = await tx.pipelineStage.findFirst({
    where: { account_id: accountId, key: transition.key },
  })
  if (!targetStage) return false

  // Only advance — never auto-move backward
  if (targetStage.display_order <= lead.stage.display_order) return false

  // Move the lead
  await tx.lead.update({
    where: { id: lead.id },
    data: {
      stage_id:         targetStage.id,
      stage_entered_at: new Date(),
      stage_reason:     transition.reason,
    },
  })

  await tx.stageHistory.create({
    data: {
      lead_id:       lead.id,
      from_stage_id: lead.stage_id,
      to_stage_id:   targetStage.id,
      changed_by:    userId,
      note:          `Auto: ${transition.reason}`,
    },
  })

  // Schedule a follow-up for the new stage
  await scheduleFollowUp(lead, targetStage.key, tx)

  return true
}
