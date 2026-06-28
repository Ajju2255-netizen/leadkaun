import { inngest } from "@/inngest/client"
import { recordJobRun } from "@/lib/events/job-run"
import { prisma } from "@/lib/prisma"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"

const BATCH_SIZE = 50

/**
 * ICP-change regrade (audit B7).
 * Event: account/icp.updated  (fired by PUT /api/settings/icp)
 *
 * Fit score depends on the account's ICP config, so when an admin edits the ICP
 * every active lead must be re-scored. Runs the scoring engine over each
 * non-terminal, non-junk lead for the account in batches.
 *
 * Concurrency is capped to 1 per account so rapid successive ICP saves don't
 * stack overlapping regrades.
 */
export const icpRegradeFn = inngest.createFunction(
  {
    id:          "icp-regrade",
    name:        "ICP Change Regrade",
    triggers:    [{ event: "account/icp.updated" }],
    concurrency: [{ key: "event.data.account_id", limit: 1 }],
  },
  async ({ event, step, logger }) => {
    await step.run("record-job-run", () => recordJobRun("icp-regrade"))
    const accountId = event.data?.account_id as string | undefined
    if (!accountId) {
      logger.warn("icp-regrade: missing account_id")
      return { regraded: 0 }
    }

    const leadIds = await step.run("load-active-leads", async () => {
      const leads = await prisma.lead.findMany({
        where:  { account_id: accountId, is_junk: false, won_at: null, lost_at: null },
        select: { id: true },
      })
      return leads.map((l) => l.id)
    })

    logger.info(`icp-regrade: ${leadIds.length} leads for account ${accountId}`)

    let regraded = 0
    let failed   = 0
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE)
      const res = await step.run(`regrade-batch-${i}`, async () => {
        let ok = 0
        let err = 0
        for (const id of batch) {
          try {
            await prisma.$transaction((tx) => processSignalAndUpdateScores(id, accountId, tx))
            ok++
          } catch (e) {
            err++
            console.warn(`[icp-regrade] lead ${id} failed:`, String(e))
          }
        }
        return { ok, err }
      })
      regraded += res.ok
      failed   += res.err
    }

    logger.info(`icp-regrade: done — ${regraded} regraded, ${failed} failed`)
    return { regraded, failed }
  },
)
