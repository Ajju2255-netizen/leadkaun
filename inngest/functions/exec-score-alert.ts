import { inngest } from "@/inngest/client"
import { prisma } from "@/lib/prisma"
import { computeExecutionScore } from "@/lib/scoring/execution-score"
import { startOfIstDay, hourIST } from "@/lib/time/ist"

/**
 * Daily execution score alert.
 * Cron: 30 9 * * 1-6   (09:30 UTC = 15:00 IST, Monday–Saturday)
 *
 * For each active rep with daily execution score < 25, creates exactly one
 * notification per (rep, day) for every ADMIN/MANAGER in that rep's account.
 *
 * Kill switch:
 *   EXEC_SCORE_ALERT_ENABLED=false → function early-returns, no alerts fire
 *   (useful for the first week of observability while calibrating thresholds).
 *
 * Idempotency:
 *   notification.find-first-or-create with (type=EXEC_SCORE_LOW,
 *   user_id=manager, lead_id=null, created_at >= startOfIstDay) → safe under
 *   re-run / Inngest retries.
 *
 * Closes deferred QA-AC line 60.
 */

const SCORE_THRESHOLD = 25

export const execScoreAlertFn = inngest.createFunction(
  {
    id: "exec-score-alert",
    name: "Daily Execution Score Alert (3pm IST)",
    triggers: [{ cron: "30 9 * * 1-6" }],
  },
  async ({ step, logger }) => {
    if (process.env.EXEC_SCORE_ALERT_ENABLED === "false") {
      logger.info("EXEC_SCORE_ALERT_ENABLED=false — skipping")
      return { skipped: true }
    }

    const now      = new Date()
    const dayStart = startOfIstDay(now)
    const hr       = hourIST(now)

    // ── Load all active reps grouped by account ──────────────────────────────
    const reps = await step.run("load-reps", async () => {
      return prisma.user.findMany({
        where: { is_active: true, role: { in: ["REP", "MANAGER", "ADMIN"] } },
        select: { id: true, first_name: true, account_id: true, role: true },
      })
    })

    if (reps.length === 0) return { reps_evaluated: 0, alerts_created: 0 }

    // ── Compute score for each rep (per-rep query — Inngest step caches) ─────
    const scored = await step.run("compute-scores", async () => {
      const results = await Promise.all(
        reps.map(async (rep) => {
          const [
            fuDue, fuCompleted, fuOverdue,
            touched, abLeads, abContacted, signals,
          ] = await Promise.all([
            prisma.followUpAction.count({
              where: { account_id: rep.account_id, assigned_rep_id: rep.id,
                       due_date: { gte: dayStart } },
            }),
            prisma.followUpAction.count({
              where: { account_id: rep.account_id, assigned_rep_id: rep.id,
                       status: "COMPLETED", completed_at: { gte: dayStart } },
            }),
            prisma.followUpAction.count({
              where: { account_id: rep.account_id, assigned_rep_id: rep.id,
                       status: "OVERDUE" },
            }),
            prisma.lead.count({
              where: { account_id: rep.account_id, assigned_rep_id: rep.id,
                       last_action_at: { gte: dayStart } },
            }),
            prisma.lead.count({
              where: { account_id: rep.account_id, assigned_rep_id: rep.id,
                       grade: { in: ["A", "B"] }, imported_at: { gte: dayStart } },
            }),
            prisma.lead.count({
              where: { account_id: rep.account_id, assigned_rep_id: rep.id,
                       grade: { in: ["A", "B"] }, imported_at: { gte: dayStart },
                       first_contact_at: { not: null } },
            }),
            prisma.signal.count({
              where: { user_id: rep.id, created_at: { gte: dayStart },
                       lead: { account_id: rep.account_id } },
            }),
          ])
          const { score, components } = computeExecutionScore({
            fu_due_today:        fuDue,
            fu_completed_today:  fuCompleted,
            fu_overdue_now:      fuOverdue,
            leads_touched_today: touched,
            ab_leads_today:      abLeads,
            ab_leads_contacted:  abContacted,
            signals_today:       signals,
            hour_ist:            hr,
          })
          return { rep, score, components }
        }),
      )
      return results
    })

    // ── Score distribution log (for first-week calibration observability) ────
    const buckets = { critical: 0, low: 0, ok: 0, good: 0, great: 0 }
    for (const r of scored) {
      if (r.score < 25) buckets.critical++
      else if (r.score < 50) buckets.low++
      else if (r.score < 70) buckets.ok++
      else if (r.score < 85) buckets.good++
      else buckets.great++
    }
    logger.info(`Score distribution: ${JSON.stringify(buckets)} (n=${scored.length})`)

    // ── Find low-score reps and load each account's managers ─────────────────
    const lowReps = scored.filter((s) => s.score < SCORE_THRESHOLD)
    if (lowReps.length === 0) {
      return { reps_evaluated: scored.length, alerts_created: 0, buckets }
    }

    const accountIds = Array.from(new Set(lowReps.map((s) => s.rep.account_id)))
    const managers = await step.run("load-managers", async () => {
      return prisma.user.findMany({
        where: {
          account_id: { in: accountIds },
          role:       { in: ["ADMIN", "MANAGER"] },
          is_active:  true,
        },
        select: { id: true, account_id: true },
      })
    })

    const managersByAccount = new Map<string, string[]>()
    for (const m of managers) {
      if (!managersByAccount.has(m.account_id)) managersByAccount.set(m.account_id, [])
      managersByAccount.get(m.account_id)!.push(m.id)
    }

    // ── Create notifications (idempotent per rep / day / manager) ────────────
    const created = await step.run("create-notifications", async () => {
      let count = 0
      for (const { rep, score, components } of lowReps) {
        const targetManagerIds = managersByAccount.get(rep.account_id) ?? []
        if (targetManagerIds.length === 0) continue

        for (const managerId of targetManagerIds) {
          // Idempotency check: one alert per (rep, manager, IST day)
          const existing = await prisma.notification.findFirst({
            where: {
              account_id: rep.account_id,
              user_id:    managerId,
              type:       "EXEC_SCORE_LOW",
              message:    { contains: rep.id },
              created_at: { gte: dayStart },
            },
            select: { id: true },
          })
          if (existing) continue

          await prisma.notification.create({
            data: {
              account_id: rep.account_id,
              user_id:    managerId,
              lead_id:    null,
              type:       "EXEC_SCORE_LOW",
              title:      `${rep.first_name} at ${score}% — behind on today's plan`,
              // Include rep.id in message for the idempotency selector above.
              // (No FK on rep_id in Notification; embedding in message is the
              // pragmatic dedupe key.)
              message:    `Execution score ${score}/100 at ${Math.floor(hr)}:00 IST. ` +
                          `FU ${components.followups_done_vs_due}, touches ${components.leads_touched}, ` +
                          `speed ${components.speed_to_lead_today}, signals ${components.signals_logged}, ` +
                          `overdue ${components.overdue_penalty}. ref:${rep.id}`,
              priority:   "high",
              action_url: `/rep-tracking#rep-${rep.id}`,
            },
          })
          count++
        }
      }
      return count
    })

    return {
      reps_evaluated: scored.length,
      reps_low:       lowReps.length,
      alerts_created: created,
      buckets,
    }
  },
)
