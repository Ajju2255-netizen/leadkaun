import type { PrismaClient } from "@prisma/client"

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]

interface StageConfig {
  delayHours: number
  actionType: "CALL" | "WHATSAPP"
  tip:        string
}

const STAGE_FOLLOW_UP: Record<string, StageConfig> = {
  contacted:     { delayHours: 4,  actionType: "CALL",     tip: "No response after first contact — call to follow up"   },
  qualified:     { delayHours: 24, actionType: "WHATSAPP", tip: "Qualified but not progressing — send a WhatsApp nudge" },
  proposal_sent: { delayHours: 48, actionType: "WHATSAPP", tip: "Proposal sent — follow up if no response"              },
  negotiation:   { delayHours: 24, actionType: "CALL",     tip: "Deal at risk — call to push forward"                   },
}

export async function scheduleFollowUp(
  lead: {
    id:              string
    account_id:      string
    assigned_rep_id: string | null
    won_at:          Date | null
    lost_at:         Date | null
    is_junk:         boolean
    is_missed:       boolean
  },
  stageKey: string,
  tx: Tx,
): Promise<void> {
  // Skip terminal, junk, missed, or unassigned leads
  if (lead.won_at || lead.lost_at || lead.is_junk || lead.is_missed) return
  if (!lead.assigned_rep_id) return

  const config = STAGE_FOLLOW_UP[stageKey]
  if (!config) return

  // Cancel any existing PENDING follow-ups for this lead
  await tx.followUpAction.updateMany({
    where: { lead_id: lead.id, status: "PENDING" },
    data:  { status: "SKIPPED" },
  })

  const dueDate = new Date(Date.now() + config.delayHours * 3_600_000)

  await tx.followUpAction.create({
    data: {
      account_id:      lead.account_id,
      lead_id:         lead.id,
      assigned_rep_id: lead.assigned_rep_id,
      day_number:      1,
      action_type:     config.actionType,
      due_date:        dueDate,
      status:          "PENDING",
      show_tip:        true,
      tip_text:        config.tip,
    },
  })
}
