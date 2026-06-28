import { inngest } from "@/inngest/client"
import { recordJobRun } from "@/lib/events/job-run"
import { prisma } from "@/lib/prisma"
import { computeDailyInsights, istDateString } from "@/lib/admin/insights"

/**
 * Daily Mission Control digest ("what should I do today?"). Computes the
 * cross-account action items and snapshots them per IST date.
 * Cron: 02:00 UTC = 07:30 AM IST.
 */
export const adminDailyInsightsFn = inngest.createFunction(
  { id: "admin-daily-insights", name: "Admin Daily Insights", triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }) => {
    await step.run("record-job-run", () => recordJobRun("admin-daily-insights"))

    const items = await step.run("compute-insights", () => computeDailyInsights())
    const forDate = istDateString()

    await step.run("store-snapshot", () =>
      prisma.adminInsight.upsert({
        where:  { for_date: forDate },
        create: { for_date: forDate, items },
        update: { items },
      })
    )

    return { for_date: forDate, items: items.length }
  },
)
