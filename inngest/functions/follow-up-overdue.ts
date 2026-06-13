import { inngest } from "@/inngest/client"
import { prisma } from "@/lib/prisma"
import { broadcastToUser } from "@/lib/realtime/broadcast"

/**
 * Follow-up overdue checker.
 * Cron: every 30 minutes
 *
 * Finds all PENDING follow-up actions where due_date < now
 * and marks them OVERDUE. Fires a broadcast alert per rep for
 * the Realtime alert listener (Phase 6).
 *
 * TAD ref: Section 6.4
 */
export const followUpOverdueFn = inngest.createFunction(
  { id: "follow-up-overdue", name: "Follow-up Overdue Checker", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step, logger }) => {
    const now = new Date()

    // Find all actions that are past due and still PENDING
    const overdueActions = await step.run("find-overdue", async () => {
      return prisma.followUpAction.findMany({
        where: {
          status:   "PENDING",
          due_date: { lt: now },
        },
        include: {
          lead: {
            select: {
              id:              true,
              first_name:      true,
              last_name:       true,
              grade:           true,
              assigned_rep_id: true,
              expected_value:  true,
            },
          },
        },
      })
    })

    if (overdueActions.length === 0) {
      logger.info("No overdue follow-ups found")
      return { overdue: 0 }
    }

    logger.info(`Marking ${overdueActions.length} follow-ups as overdue`)

    // Mark all overdue in bulk, increment escalation counter
    await step.run("mark-overdue", async () => {
      await prisma.followUpAction.updateMany({
        where: {
          id: { in: overdueActions.map((a) => a.id) },
        },
        data: { status: "OVERDUE", is_overdue: true, escalation_count: { increment: 1 } },
      })
    })

    // Create FOLLOW_UP_DUE notifications (one per lead per 6h, assigned to rep)
    await step.run("create-followup-notifications", async () => {
      const dedup6h = new Date(Date.now() - 6 * 3_600_000)
      for (const action of overdueActions) {
        if (!action.lead) continue

        const existing = await prisma.notification.findFirst({
          where: { lead_id: action.lead.id, type: "FOLLOW_UP_DUE", created_at: { gte: dedup6h } },
        })
        if (existing) continue

        const v = action.lead.expected_value
        const val = v
          ? v >= 100_000 ? `₹${(v / 100_000).toFixed(1)}L` : `₹${(v / 1_000).toFixed(0)}K`
          : null

        await prisma.notification.create({
          data: {
            account_id: action.account_id,
            user_id:    action.assigned_rep_id,
            lead_id:    action.lead.id,
            type:       "FOLLOW_UP_DUE",
            title:      val ? `${val} follow-up overdue` : "Follow-up overdue",
            message:    `${action.lead.first_name} ${action.lead.last_name ?? ""} — ${action.action_type.toLowerCase()} action past due`.trim(),
            priority:   action.lead.grade === "A" ? "high" : action.lead.grade === "B" ? "medium" : "low",
            action_url: "/follow-ups",
          },
        })
      }
    })

    // Group by rep — one alert event per rep with their overdue count
    const repMap = new Map<string, typeof overdueActions>()
    for (const action of overdueActions) {
      const repId = action.assigned_rep_id
      if (!repMap.has(repId)) repMap.set(repId, [])
      repMap.get(repId)!.push(action)
    }

    // Broadcast a realtime toast to each affected rep (audit B3). Previously this
    // fired an `alerts/follow-up.overdue` Inngest event that had NO consumer, so
    // the AlertListener's `follow_up_overdue` toast never showed. Broadcasting
    // directly to `alerts:{repId}` is what the client actually listens for.
    await step.run("broadcast-rep-alerts", async () => {
      for (const [repId, actions] of Array.from(repMap.entries())) {
        await broadcastToUser(repId, "follow_up_overdue", {
          overdue_count: actions.length,
          grade_a_count: actions.filter((a) => a.lead.grade === "A").length,
          lead_ids:      actions.map((a) => a.lead.id),
        })
      }
    })

    return { overdue: overdueActions.length, reps_alerted: repMap.size }
  },
)
