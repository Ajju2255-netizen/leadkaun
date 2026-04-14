import { inngest } from "@/inngest/client"
import { prisma } from "@/lib/prisma"

function fmtValue(v: number | null): string | null {
  if (!v) return null
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v}`
}

/**
 * Missed opportunity checker.
 * Cron: hourly (0 * * * *)
 *
 * Finds A/B leads where last_action_at (or imported_at if never actioned)
 * exceeds the threshold:
 *   Grade A: 6 hours
 *   Grade B: 24 hours
 *
 * Marks each lead is_missed=true, missed_at=now.
 * Fires alert events for managers and reps.
 *
 * TAD ref: Section 6.5 (M09 Missed Opportunity)
 */
export const missedOpportunityFn = inngest.createFunction(
  { id: "missed-opportunity", name: "Missed Opportunity Checker", triggers: [{ cron: "0 * * * *" }] },
  async ({ step, logger }) => {
    const now = new Date()

    const threshold6h  = new Date(now.getTime() - 6  * 60 * 60 * 1000)
    const threshold24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // ── Find Grade A leads not actioned in 6h ────────────────────────────────
    const missedALeads = await step.run("find-missed-a-grade", async () => {
      return prisma.lead.findMany({
        where: {
          grade:     "A",
          is_junk:   false,
          is_missed: false,
          won_at:    null,
          lost_at:   null,
          OR: [
            { last_action_at: null,                 imported_at:     { lte: threshold6h  } },
            { last_action_at: { lte: threshold6h  }                                        },
          ],
        },
        select: {
          id:              true,
          first_name:      true,
          last_name:       true,
          account_id:      true,
          assigned_rep_id: true,
          expected_value:  true,
          imported_at:     true,
          last_action_at:  true,
          grade:           true,
        },
      })
    })

    // ── Find Grade B leads not actioned in 24h ───────────────────────────────
    const missedBLeads = await step.run("find-missed-b-grade", async () => {
      return prisma.lead.findMany({
        where: {
          grade:     "B",
          is_junk:   false,
          is_missed: false,
          won_at:    null,
          lost_at:   null,
          OR: [
            { last_action_at: null,                 imported_at:     { lte: threshold24h } },
            { last_action_at: { lte: threshold24h }                                        },
          ],
        },
        select: {
          id:              true,
          first_name:      true,
          last_name:       true,
          account_id:      true,
          assigned_rep_id: true,
          expected_value:  true,
          imported_at:     true,
          last_action_at:  true,
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

    // ── Mark leads as missed in DB ────────────────────────────────────────────
    await step.run("mark-missed", async () => {
      const ids = allMissed.map((l) => l.id)
      await prisma.lead.updateMany({
        where: { id: { in: ids } },
        data:  { is_missed: true, missed_at: now },
      })
      return ids.length
    })

    // ── Create AT_RISK notifications for leads approaching threshold ──────────
    await step.run("create-at-risk-notifications", async () => {
      const threshold4h  = new Date(now.getTime() -  4 * 60 * 60 * 1000)
      const threshold20h = new Date(now.getTime() - 20 * 60 * 60 * 1000)

      // A leads in 4h–6h window; B leads in 20h–24h window (not yet missed)
      const atRiskLeads = await prisma.lead.findMany({
        where: {
          is_missed: false, won_at: null, lost_at: null, is_junk: false,
          OR: [
            { grade: "A", last_action_at: { gte: threshold6h,  lt: threshold4h  } },
            { grade: "A", last_action_at: null, imported_at: { gte: threshold6h,  lt: threshold4h  } },
            { grade: "B", last_action_at: { gte: threshold24h, lt: threshold20h } },
            { grade: "B", last_action_at: null, imported_at: { gte: threshold24h, lt: threshold20h } },
          ],
        },
        select: { id: true, account_id: true, first_name: true, last_name: true, expected_value: true, grade: true },
      })

      for (const lead of atRiskLeads) {
        const existing = await prisma.notification.findFirst({
          where: { lead_id: lead.id, type: "AT_RISK", created_at: { gte: new Date(now.getTime() - 4 * 60 * 60 * 1000) } },
        })
        if (existing) continue

        const val = fmtValue(lead.expected_value)
        await prisma.notification.create({
          data: {
            account_id: lead.account_id,
            lead_id:    lead.id,
            type:       "AT_RISK",
            title:      val ? `${val} lead going cold` : `Grade ${lead.grade} lead going cold`,
            message:    `${lead.first_name} ${lead.last_name ?? ""} — no action taken, approaching missed threshold`.trim(),
            priority:   lead.grade === "A" ? "high" : "medium",
            action_url: "/queue",
          },
        })
      }
    })

    // ── Create MISSED notifications ───────────────────────────────────────────
    await step.run("create-missed-notifications", async () => {
      for (const lead of allMissed) {
        const existing = await prisma.notification.findFirst({
          where: { lead_id: lead.id, type: "MISSED", created_at: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        })
        if (existing) continue

        const val = fmtValue(lead.expected_value)
        await prisma.notification.create({
          data: {
            account_id: lead.account_id,
            lead_id:    lead.id,
            type:       "MISSED",
            title:      val ? `❌ ${val} lead missed` : `❌ Grade ${lead.grade} lead missed`,
            message:    `${lead.first_name} ${lead.last_name ?? ""} went cold — no action taken in time`.trim(),
            priority:   lead.grade === "A" ? "high" : "medium",
            action_url: "/missed",
          },
        })
      }
    })

    // ── Group by account ──────────────────────────────────────────────────────
    const accountMap = new Map<string, typeof allMissed>()
    for (const lead of allMissed) {
      if (!accountMap.has(lead.account_id)) accountMap.set(lead.account_id, [])
      accountMap.get(lead.account_id)!.push(lead)
    }

    // ── Fire alert events per account ─────────────────────────────────────────
    await step.run("fire-account-alerts", async () => {
      const accountIds = Array.from(accountMap.keys())

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
        const accountLeads     = accountMap.get(manager.account_id) ?? []
        const aGradeLeads      = accountLeads.filter((l) => l.grade === "A")
        const bGradeLeads      = accountLeads.filter((l) => l.grade === "B")
        const totalValueAtRisk = accountLeads.reduce(
          (sum, l) => sum + (l.expected_value ?? 0), 0,
        )

        return {
          name: "alerts/missed-opportunity",
          data: {
            manager_id:     manager.id,
            email:          manager.email,
            first_name:     manager.first_name,
            account_id:     manager.account_id,
            missed_a_count: aGradeLeads.length,
            missed_b_count: bGradeLeads.length,
            total_missed:   accountLeads.length,
            value_at_risk:  totalValueAtRisk,
            lead_ids:       aGradeLeads.map((l) => l.id),
          },
        }
      })

      if (events.length > 0) await inngest.send(events)
      return events.length
    })

    // ── Fire per-rep alerts ───────────────────────────────────────────────────
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

      if (repEvents.length > 0) await inngest.send(repEvents)
      return repEvents.length
    })

    return {
      missed_a:       missedALeads.length,
      missed_b:       missedBLeads.length,
      total_accounts: accountMap.size,
    }
  },
)
