import { inngest } from "@/inngest/client"
import { recordJobRun } from "@/lib/events/job-run"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/send"
import { AdminNewSignup, type NewSignupItem } from "@/emails/AdminNewSignup"
import { getAdminRecipients, adminUrl } from "@/lib/admin/notify"
import * as React from "react"

const FUNCTION = "signup-alert"
/** First-ever run has no watermark; don't spam the whole history. */
const COLD_START_WINDOW_MS = 60 * 60 * 1000

/**
 * Tell the platform admins when a company signs up, within ~15 minutes.
 *
 * WATERMARK: the window starts at the last SUCCESSFUL run of this function, read
 * from `job_runs` — there is no cursor table. That choice matters:
 *
 *   · The JobRun row is written at the END, with the real status. A failed send
 *     therefore leaves the watermark where it was, and the next run re-covers
 *     the same window instead of dropping the alert on the floor.
 *   · That makes delivery at-least-once. For a signup notification a rare
 *     duplicate is strictly better than a silent miss.
 *   · A hard crash writes nothing at all, which self-heals the same way.
 *
 * Runs every 15 minutes and sends EMAIL ONLY. Slack is handled instantly by the
 * register action (lib/admin/notify.ts → announceSignupsToSlack) — posting here
 * as well would double-notify on every signup, which is a different thing from
 * the rare watermark-replay duplicate described above. This job stays the
 * guaranteed channel: if the instant Slack post fails, the email still lands
 * within 15 minutes.
 */
export const signupAlertFn = inngest.createFunction(
  { id: FUNCTION, name: "New Signup Alert", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    // The instant this run's window CLOSES. Captured before the query and
    // written as the JobRun's started_at, so the next window opens exactly here
    // — anything created while this run executes belongs to the next one.
    const runAt = await step.run("mark-run-start", async () => new Date().toISOString())

    // 1. Where did we get to last time? Read BEFORE recording this run.
    const since = await step.run("read-watermark", async () => {
      const last = await prisma.jobRun.findFirst({
        where: { function: FUNCTION, status: "success" },
        orderBy: { started_at: "desc" },
        select: { started_at: true },
      })
      return (last?.started_at ?? new Date(Date.now() - COLD_START_WINDOW_MS)).toISOString()
    })

    const accounts = await step.run("find-new-accounts", () =>
      prisma.account.findMany({
        where: { created_at: { gt: new Date(since), lte: new Date(runAt) } },
        orderBy: { created_at: "asc" },
        take: 50,
        select: {
          id: true, name: true, industry: true, city: true, created_at: true,
          team_size: true, monthly_lead_vol: true, signup_utm_source: true,
          users: {
            where: { role: "ADMIN" }, orderBy: { created_at: "asc" }, take: 1,
            select: { first_name: true, last_name: true, email: true },
          },
        },
      }),
    )

    if (accounts.length === 0) {
      // Nothing to send, but the run succeeded — advance the watermark so the
      // next window starts here rather than re-scanning.
      await step.run("record-job-run", () => recordJobRun(FUNCTION, "success", undefined, new Date(runAt)))
      return { newSignups: 0, notified: false }
    }

    const recipients = await step.run("resolve-recipients", () => getAdminRecipients())

    if (recipients.length === 0) {
      // Do NOT advance the watermark: once an admin exists they should still
      // hear about these signups.
      await step.run("record-job-run", () =>
        recordJobRun(
          FUNCTION,
          "failed",
          "No platform admin recipients — set PLATFORM_ADMIN_EMAILS or add a platform_admins row",
          new Date(runAt),
        ),
      )
      return { newSignups: accounts.length, notified: false, reason: "no-recipients" }
    }

    const items: NewSignupItem[] = accounts.map((a) => {
      const owner = a.users[0]
      return {
        name: a.name,
        industry: a.industry,
        city: a.city,
        ownerName: owner ? `${owner.first_name} ${owner.last_name ?? ""}`.trim() : null,
        ownerEmail: owner?.email ?? null,
        source: a.signup_utm_source,
        teamSize: a.team_size,
        monthlyLeadVolume: a.monthly_lead_vol,
        adminUrl: adminUrl(`/accounts/${a.id}`),
        // Anything returned from step.run() has been through JSON, so this is a
        // string at runtime even though Prisma typed it as a Date.
        signedUpAt: new Date(a.created_at).toLocaleString("en-IN", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
        }) + " IST",
      }
    })

    const subject = items.length === 1
      ? `New Leadkaun signup — ${items[0].name}`
      : `${items.length} new Leadkaun signups`

    const emailResult = await step.run("send-email", () =>
      sendEmail({
        to: recipients,
        subject,
        react: React.createElement(AdminNewSignup, { signups: items, dashboardUrl: adminUrl("/business") }),
        template: "admin_new_signup",
        // Internal email — deliberately not attributed to a customer account,
        // so it never pollutes that account's email engagement stats.
        accountId: null,
      }),
    )

    // Email is the channel of record. If it did not go out, fail the run so the
    // watermark stays put and the next tick retries this exact window.
    await step.run("record-job-run", () =>
      emailResult.success
        ? recordJobRun(FUNCTION, "success", undefined, new Date(runAt))
        : recordJobRun(FUNCTION, "failed", emailResult.error ?? "email send failed", new Date(runAt)),
    )

    return {
      newSignups: accounts.length,
      notified: emailResult.success,
      recipients: recipients.length,
      since,
    }
  },
)
