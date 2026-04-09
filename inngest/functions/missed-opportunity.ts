import { inngest } from "@/inngest/client"
import { prisma } from "@/lib/prisma"

/**
 * Missed opportunity checker.
 * Cron: hourly (0 * * * *)
 *
 * Finds leads that have slipped through the cracks:
 * - Grade A: not contacted (first_contact_at is null) for 48+ hours
 * - Grade B: not contacted for 72+ hours
 *
 * For each account, sends uncalled-A-grade alert to all Managers/Admins.
 * Fires per-rep alert events for rep notification (picked up by Realtime).
 *
 * TAD ref: Section 6.5 (M09 Missed Opportunity)
 */
export const missedOpportunityFn = inngest.createFunction(
  { id: "missed-opportunity", name: "Missed Opportunity Checker", triggers: [{ cron: "0 * * * *" }] },
  async ({ step, logger }) => {
    const now = new Date()

    const threshold48h = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const threshold72h = new Date(now.getTime() - 72 * 60 * 60 * 1000)

    // ── Find all missed Grade A leads (48h no contact) ────────────────────────
    const missedALeads = await step.run("find-missed-a-grade", async () => {
      return prisma.lead.findMany({
        where: {
          grade:            "A",
          first_contact_at: null,
          is_junk:          false,
          won_at:           null,
          lost_at:          null,
          imported_at:      { lte: threshold48h },
        },
        select: {
          id:              true,
          first_name:      true,
          last_name:       true,
          account_id:      true,
          assigned_rep_id: true,
          expected_value:  true,
          imported_at:     true,
          grade:           true,
        },
      })
    })

    // ── Find all missed Grade B leads (72h no contact) ────────────────────────
    const missedBLeads = await step.run("find-missed-b-grade", async () => {
      return prisma.lead.findMany({
        where: {
          grade:            "B",
          first_contact_at: null,
          is_junk:          false,
          won_at:           null,
          lost_at:          null,
          imported_at:      { lte: threshold72h },
        },
        select: {
          id:              true,
          first_name:      true,
          last_name:       true,
          account_id:      true,
          assigned_rep_id: true,
          expected_value:  true,
          imported_at:     true,
          grade:           true,
        },
      })
    })

    const allMissed = [...missedALeads, ...missedBLeads]

    if (allMissed.length === 0) {
      logger.info("No missed opportunities found")
      return { missed_a: 0, missed_b: 0 }
    }

    logger.info(
      `Missed opportunities: ${missedALeads.length} Grade A, ${missedBLeads.length} Grade B`,
    )

    // ── Group by account ──────────────────────────────────────────────────────
    const accountMap = new Map<string, typeof allMissed>()
    for (const lead of allMissed) {
      if (!accountMap.has(lead.account_id)) accountMap.set(lead.account_id, [])
      accountMap.get(lead.account_id)!.push(lead)
    }

    // ── Fire alert events per account ─────────────────────────────────────────
    await step.run("fire-account-alerts", async () => {
      const accountIds = Array.from(accountMap.keys())

      // Load managers/admins for all affected accounts
      const managers = await prisma.user.findMany({
        where: {
          account_id: { in: accountIds },
          role:       { in: ["ADMIN", "MANAGER"] },
          is_active:  true,
        },
        select: {
          id:         true,
          email:      true,
          first_name: true,
          account_id: true,
        },
      })

      const events = managers.map((manager) => {
        const accountLeads = accountMap.get(manager.account_id) ?? []
        const aGradeLeads  = accountLeads.filter((l) => l.grade === "A")
        const bGradeLeads  = accountLeads.filter((l) => l.grade === "B")

        const totalValueAtRisk = accountLeads.reduce(
          (sum, l) => sum + (l.expected_value ?? 0),
          0,
        )

        return {
          name: "alerts/missed-opportunity",
          data: {
            manager_id:        manager.id,
            email:             manager.email,
            first_name:        manager.first_name,
            account_id:        manager.account_id,
            missed_a_count:    aGradeLeads.length,
            missed_b_count:    bGradeLeads.length,
            total_missed:      accountLeads.length,
            value_at_risk:     totalValueAtRisk,
            lead_ids:          aGradeLeads.map((l) => l.id),  // A-grade only for alert
          },
        }
      })

      if (events.length > 0) {
        await inngest.send(events)
      }

      return events.length
    })

    // ── Fire per-rep alerts for their own missed leads ────────────────────────
    await step.run("fire-rep-alerts", async () => {
      const repMap = new Map<string, typeof allMissed>()
      for (const lead of allMissed) {
        if (!lead.assigned_rep_id) continue
        if (!repMap.has(lead.assigned_rep_id)) repMap.set(lead.assigned_rep_id, [])
        repMap.get(lead.assigned_rep_id)!.push(lead)
      }

      const repEvents = Array.from(repMap.entries()).map(([repId, leads]) => ({
        name: "alerts/rep-missed-opportunity",
        data: {
          rep_id:         repId,
          missed_a_count: leads.filter((l) => l.grade === "A").length,
          missed_b_count: leads.filter((l) => l.grade === "B").length,
          lead_ids:       leads.map((l) => l.id),
        },
      }))

      if (repEvents.length > 0) {
        await inngest.send(repEvents)
      }

      return repEvents.length
    })

    return {
      missed_a:       missedALeads.length,
      missed_b:       missedBLeads.length,
      total_accounts: accountMap.size,
    }
  },
)
