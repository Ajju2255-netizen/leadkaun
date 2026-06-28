import * as React from "react"
import { inngest } from "@/inngest/client"
import { recordJobRun } from "@/lib/events/job-run"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/send"
import { MorningBriefRep } from "@/emails/MorningBriefRep"
import { MorningBriefManager } from "@/emails/MorningBriefManager"
import type { TopLead } from "@/emails/MorningBriefRep"
import type { RepStat, UncalledALead } from "@/emails/MorningBriefManager"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.leadkaun.com"

/**
 * Morning brief emailer.
 * Cron: 03:00 UTC = 08:30 AM IST, Monday–Saturday
 *
 * Sends personalised morning brief to:
 * - Every active REP: top leads, callbacks, follow-ups due today
 * - Every ADMIN/MANAGER: pipeline summary, uncalled A-grade, team stats
 *
 * TAD ref: Section 6.5
 */
export const morningBriefFn = inngest.createFunction(
  { id: "morning-brief", name: "Morning Brief Emails", triggers: [{ cron: "0 3 * * 1-6" }] },
  async ({ step, logger }) => {
    await step.run("record-job-run", () => recordJobRun("morning-brief"))
    const accounts = await step.run("load-accounts", async () => {
      return prisma.account.findMany({
        include: {
          users: {
            where: { is_active: true },
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      })
    })

    logger.info(`Morning brief: ${accounts.length} accounts`)

    let emailsSent = 0

    for (const account of accounts) {
      if (account.users.length === 0) continue

      const count = await step.run(`brief-account-${account.id}`, async () => {
        const today    = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const gradeAThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000)

        let sent = 0

        for (const user of account.users) {
          // ── Rep brief ────────────────────────────────────────────────────
          if (user.role === "REP") {
            const [rawTopLeads, callbacksDue, followUpsDue, reEngagements, completedThisWeek, recentWin] =
              await Promise.all([
                prisma.lead.findMany({
                  where: {
                    account_id:      account.id,
                    assigned_rep_id: user.id,
                    grade:           { in: ["A", "B"] },
                    is_junk:         false,
                    won_at:          null,
                    lost_at:         null,
                  },
                  orderBy: [{ grade: "asc" }, { intent_score: "desc" }],
                  take: 3,
                  select: {
                    id: true, first_name: true, last_name: true, company_name: true,
                    grade: true, expected_value: true,
                  },
                }),
                prisma.followUpAction.count({
                  where: {
                    assigned_rep_id: user.id,
                    action_type:     "CALL",
                    status:          "PENDING",
                    due_date:        { gte: today, lt: tomorrow },
                  },
                }),
                prisma.followUpAction.count({
                  where: {
                    assigned_rep_id: user.id,
                    status:          "PENDING",
                    due_date:        { gte: today, lt: tomorrow },
                  },
                }),
                prisma.followUpAction.count({
                  where: {
                    assigned_rep_id: user.id,
                    status:          "PENDING",
                    due_date:        { lt: today },
                  },
                }),
                prisma.followUpAction.count({
                  where: {
                    assigned_rep_id: user.id,
                    status:          "COMPLETED",
                    due_date:        { gte: weekAgo },
                  },
                }),
                prisma.lead.findFirst({
                  where: {
                    account_id:      account.id,
                    assigned_rep_id: user.id,
                    won_at:          { gte: weekAgo },
                  },
                  orderBy: { won_at: "desc" },
                  select: { first_name: true, last_name: true, won_value: true },
                }),
              ])

            const topLeads: TopLead[] = rawTopLeads.map((l) => ({
              id:             l.id,
              first_name:     l.first_name,
              last_name:      l.last_name,
              company_name:   l.company_name,
              grade:          l.grade,
              nba:            "Follow up today",   // simplified; full NBA in app
              expected_value: l.expected_value,
            }))

            await sendEmail({
              to:       user.email,
              template: "morning_brief",
              subject: `Your morning brief — ${callbacksDue} callbacks due today`,
              react:   React.createElement(MorningBriefRep, {
                rep_first_name:      user.first_name,
                top_leads:           topLeads,
                callbacks_due:       callbacksDue,
                re_engagements:      reEngagements,
                follow_ups_due:      followUpsDue,
                completed_this_week: completedThisWeek,
                win_highlight:       recentWin?.won_value
                  ? { lead_name: `${recentWin.first_name} ${recentWin.last_name ?? ""}`.trim(), value: recentWin.won_value }
                  : null,
                queue_url: `${APP_URL}/queue`,
              }),
            })
            sent++
          }

          // ── Manager/Admin brief ──────────────────────────────────────────
          if (user.role === "ADMIN" || user.role === "MANAGER") {
            const [pipelineValue, totalLeads, overdueFollowUps, rawUncalledA, repData] =
              await Promise.all([
                prisma.lead.aggregate({
                  where: { account_id: account.id, is_junk: false, won_at: null, lost_at: null },
                  _sum:  { expected_value: true },
                }),
                prisma.lead.count({
                  where: { account_id: account.id, is_junk: false, won_at: null, lost_at: null },
                }),
                prisma.followUpAction.count({
                  where: { account_id: account.id, status: "OVERDUE" },
                }),
                prisma.lead.findMany({
                  where: {
                    account_id:       account.id,
                    grade:            "A",
                    first_contact_at: null,
                    is_junk:          false,
                    won_at:           null,
                    lost_at:          null,
                    created_at:       { lt: gradeAThreshold },
                  },
                  select: {
                    first_name: true, last_name: true, company_name: true, created_at: true,
                    assigned_rep: { select: { first_name: true, last_name: true } },
                  },
                  take: 10,
                }),
                prisma.user.findMany({
                  where: { account_id: account.id, role: "REP", is_active: true },
                  select: {
                    id: true, first_name: true, last_name: true,
                    assigned_leads: {
                      where: { is_junk: false, won_at: null, lost_at: null },
                      select: { grade: true, expected_value: true, speed_to_lead_hours: true },
                    },
                  },
                }),
              ])

            const uncalledALeads: UncalledALead[] = rawUncalledA.map((l) => ({
              first_name:         l.first_name,
              last_name:          l.last_name,
              company_name:       l.company_name,
              rep_name:           l.assigned_rep
                ? `${l.assigned_rep.first_name} ${l.assigned_rep.last_name}`
                : "Unassigned",
              hours_since_assign: (Date.now() - l.created_at.getTime()) / (60 * 60 * 1000),
            }))

            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            const repStats: RepStat[] = await Promise.all(repData.map(async (rep) => {
              const leads  = rep.assigned_leads
              const speeds = leads.map((l) => l.speed_to_lead_hours).filter((s): s is number => s != null)
              const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null
              const missedValue = leads
                .filter((l) => l.grade === "A" || l.grade === "B")
                .reduce((s, l) => s + (l.expected_value ?? 0), 0)

              // Compute real follow-up %
              const [completed, overdue] = await Promise.all([
                prisma.followUpAction.count({
                  where: { account_id: account.id, assigned_rep_id: rep.id, status: "COMPLETED", completed_at: { gte: weekAgo } },
                }),
                prisma.followUpAction.count({
                  where: { account_id: account.id, assigned_rep_id: rep.id, status: "OVERDUE" },
                }),
              ])
              const total = completed + overdue
              const fuPct = total > 0 ? Math.round((completed / total) * 100) : 100

              return {
                first_name:          rep.first_name,
                last_name:           rep.last_name,
                assigned:            leads.length,
                follow_up_pct:       fuPct,
                speed_to_lead_hours: avgSpeed,
                missed_value:        missedValue,
              }
            }))

            const topRep = repStats.sort((a, b) => b.follow_up_pct - a.follow_up_pct)[0] ?? null
            const teamFupPct = repStats.length > 0
              ? Math.round(repStats.reduce((s, r) => s + r.follow_up_pct, 0) / repStats.length)
              : 0

            await sendEmail({
              to:       user.email,
              template: "morning_brief_manager",
              subject: `Team morning brief — ${formatRupee(pipelineValue._sum.expected_value ?? 0)} pipeline`,
              react:   React.createElement(MorningBriefManager, {
                manager_first_name:   user.first_name,
                pipeline_value:       pipelineValue._sum.expected_value ?? 0,
                total_active_leads:   totalLeads,
                team_followup_pct:    teamFupPct,
                uncalled_a_grade:     uncalledALeads,
                missed_followups_count: overdueFollowUps,
                rep_stats:            repStats,
                rep_spotlight:        topRep,
                dashboard_url:        `${APP_URL}/analytics`,
              }),
            })
            sent++
          }
        }

        return sent
      })

      emailsSent += count
    }

    logger.info(`Morning brief: ${emailsSent} emails sent`)
    return { accounts: accounts.length, emails_sent: emailsSent }
  },
)

function formatRupee(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n}`
}
