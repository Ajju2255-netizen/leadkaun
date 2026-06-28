import { inngest } from "@/inngest/client"
import { recordJobRun } from "@/lib/events/job-run"
import { prisma } from "@/lib/prisma"

/**
 * Per-grade missed-opportunity windows (hours since last action / import).
 * Sourced from vault `07 - Brand Brain/Product/Features/M09 - Missed Opportunity Engine.md`.
 *
 * Tuning these here propagates to detection, at-risk windows, and alert payloads.
 * Future-proof: add a new grade by extending the object — every loop below
 * iterates the entries.
 */
export const MISSED_THRESHOLDS_HOURS = { A: 24, B: 48, C: 24 * 7, D: 24 * 30 } as const

/** At-risk = lead has reached this fraction of its missed threshold. */
const AT_RISK_WINDOW_RATIO = 5 / 6

type Grade = keyof typeof MISSED_THRESHOLDS_HOURS

const GRADES = Object.keys(MISSED_THRESHOLDS_HOURS) as Grade[]

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

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
 * Finds leads (by grade) where last_action_at (or imported_at if never
 * actioned) exceeds the configured threshold:
 *   Grade A: 24h | Grade B: 48h | Grade C: 7d | Grade D: 30d
 *
 * Marks each lead is_missed=true, missed_at=now.
 * Fires alert events for managers and reps.
 *
 * TAD ref: Section 6.5 (M09 Missed Opportunity)
 */
export const missedOpportunityFn = inngest.createFunction(
  { id: "missed-opportunity", name: "Missed Opportunity Checker", triggers: [{ cron: "0 * * * *" }] },
  async ({ step, logger }) => {
    await step.run("record-job-run", () => recordJobRun("missed-opportunity"))
    const now = new Date()

    // ── Find missed leads per grade in parallel ──────────────────────────────
    const perGrade = await Promise.all(
      GRADES.map(async (grade) => {
        const threshold = hoursAgo(now, MISSED_THRESHOLDS_HOURS[grade])
        const leads = await step.run(`find-missed-${grade.toLowerCase()}-grade`, async () => {
          return prisma.lead.findMany({
            where: {
              grade,
              is_junk:   false,
              is_missed: false,
              won_at:    null,
              lost_at:   null,
              OR: [
                { last_action_at: null,           imported_at:     { lte: threshold } },
                { last_action_at: { lte: threshold }                                   },
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
        return [grade, leads] as const
      }),
    )

    const missedByGrade = Object.fromEntries(perGrade) as Record<Grade, typeof perGrade[number][1]>
    const allMissed    = perGrade.flatMap(([, leads]) => leads)

    if (allMissed.length === 0) {
      logger.info("No missed opportunities found")
      return Object.fromEntries(GRADES.map((g) => [`missed_${g.toLowerCase()}`, 0]))
    }

    logger.info(
      `Missed opportunities: ${GRADES.map((g) => `${missedByGrade[g].length} Grade ${g}`).join(", ")}`,
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
      // Build per-grade at-risk windows: [thresholdHours * RATIO, thresholdHours)
      const orClauses = GRADES.flatMap<{
        grade: Grade
        last_action_at?: { gte: Date; lt: Date } | null
        imported_at?: { gte: Date; lt: Date }
      }>((grade) => {
        const full = MISSED_THRESHOLDS_HOURS[grade]
        const warn = full * AT_RISK_WINDOW_RATIO
        const upper = hoursAgo(now, warn)  // closer to now
        const lower = hoursAgo(now, full)  // farther from now
        return [
          { grade, last_action_at: { gte: lower, lt: upper } },
          { grade, last_action_at: null, imported_at: { gte: lower, lt: upper } },
        ]
      })

      const atRiskLeads = await prisma.lead.findMany({
        where: {
          is_missed: false, won_at: null, lost_at: null, is_junk: false,
          OR: orClauses,
        },
        select: { id: true, account_id: true, first_name: true, last_name: true, expected_value: true, grade: true },
      })

      for (const lead of atRiskLeads) {
        const dedupeWindow = hoursAgo(now, 4)
        const existing = await prisma.notification.findFirst({
          where: { lead_id: lead.id, type: "AT_RISK", created_at: { gte: dedupeWindow } },
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
            priority:   lead.grade === "A" ? "high" : lead.grade === "B" ? "medium" : "low",
            action_url: "/queue",
          },
        })
      }
    })

    // ── Create MISSED notifications ───────────────────────────────────────────
    await step.run("create-missed-notifications", async () => {
      const dedupeWindow = hoursAgo(now, 24)
      for (const lead of allMissed) {
        const existing = await prisma.notification.findFirst({
          where: { lead_id: lead.id, type: "MISSED", created_at: { gte: dedupeWindow } },
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
            priority:   lead.grade === "A" ? "high" : lead.grade === "B" ? "medium" : "low",
            action_url: "/missed",
          },
        })
      }
    })

    // ── Create RECOVERY notifications (audit B9) ──────────────────────────────
    // A missed Grade A/B lead with an owner still has real recovery potential.
    // Surface a rep-targeted, lead-specific "recover now" nudge (distinct from
    // the account-wide MISSED feed). This is what the notifications UI's RECOVERY
    // type + "Recover now" CTA were built for but never received.
    await step.run("create-recovery-notifications", async () => {
      const dedupeWindow = hoursAgo(now, 24)
      const recoverable = allMissed.filter(
        (l) => (l.grade === "A" || l.grade === "B") && l.assigned_rep_id,
      )
      for (const lead of recoverable) {
        const existing = await prisma.notification.findFirst({
          where: { lead_id: lead.id, type: "RECOVERY", created_at: { gte: dedupeWindow } },
        })
        if (existing) continue

        const val = fmtValue(lead.expected_value)
        await prisma.notification.create({
          data: {
            account_id: lead.account_id,
            user_id:    lead.assigned_rep_id,   // rep-targeted, unlike MISSED
            lead_id:    lead.id,
            type:       "RECOVERY",
            title:      val ? `Recover ${val} lead` : `Recover Grade ${lead.grade} lead`,
            message:    `${lead.first_name} ${lead.last_name ?? ""} went cold but is still worth a call — reach out now to recover it`.trim(),
            priority:   lead.grade === "A" ? "high" : "medium",
            action_url: `/leads/${lead.id}`,
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
        const totalValueAtRisk = accountLeads.reduce(
          (sum, l) => sum + (l.expected_value ?? 0), 0,
        )

        const countsByGrade = Object.fromEntries(
          GRADES.map((g) => [
            `missed_${g.toLowerCase()}_count`,
            accountLeads.filter((l) => l.grade === g).length,
          ]),
        ) as Record<string, number>

        return {
          name: "alerts/missed-opportunity",
          data: {
            manager_id:     manager.id,
            email:          manager.email,
            first_name:     manager.first_name,
            account_id:     manager.account_id,
            ...countsByGrade,
            total_missed:   accountLeads.length,
            value_at_risk:  totalValueAtRisk,
            // High-priority leads to surface in the email — A first, then B
            lead_ids:       accountLeads
              .filter((l) => l.grade === "A" || l.grade === "B")
              .map((l) => l.id),
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

      const repEvents = Array.from(repMap.entries()).map(([repId, leads]) => {
        const countsByGrade = Object.fromEntries(
          GRADES.map((g) => [
            `missed_${g.toLowerCase()}_count`,
            leads.filter((l) => l.grade === g).length,
          ]),
        ) as Record<string, number>
        return {
          name: "alerts/rep-missed-opportunity",
          data: {
            rep_id:   repId,
            ...countsByGrade,
            lead_ids: leads.map((l) => l.id),
          },
        }
      })

      if (repEvents.length > 0) await inngest.send(repEvents)
      return repEvents.length
    })

    return {
      ...Object.fromEntries(GRADES.map((g) => [`missed_${g.toLowerCase()}`, missedByGrade[g].length])),
      total_accounts: accountMap.size,
    }
  },
)
