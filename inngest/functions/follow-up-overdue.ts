import { inngest } from "@/inngest/client"
import { prisma } from "@/lib/prisma"

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

    // Group by rep — one alert event per rep with their overdue count
    const repMap = new Map<string, typeof overdueActions>()
    for (const action of overdueActions) {
      const repId = action.assigned_rep_id
      if (!repMap.has(repId)) repMap.set(repId, [])
      repMap.get(repId)!.push(action)
    }

    // Fire alert events for each rep (picked up by Realtime in Phase 6)
    await step.run("fire-rep-alerts", async () => {
      const events = Array.from(repMap.entries()).map(([repId, actions]) => ({
        name: "alerts/follow-up.overdue",
        data: {
          rep_id:        repId,
          overdue_count: actions.length,
          grade_a_count: actions.filter((a) => a.lead.grade === "A").length,
          lead_ids:      actions.map((a) => a.lead.id),
        },
      }))

      if (events.length > 0) {
        await inngest.send(events)
      }
    })

    return { overdue: overdueActions.length, reps_alerted: repMap.size }
  },
)
