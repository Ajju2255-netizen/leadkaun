import { inngest } from "@/inngest/client"
import { recordJobRun } from "@/lib/events/job-run"
import { prisma } from "@/lib/prisma"
import { fetchSheetRows } from "@/lib/import/fetch-sheet"
import { runSheetImport } from "@/lib/import/run-sheet-import"

/**
 * Google Sheets auto-sync — no OAuth.
 * Cron: every 5 minutes.
 *
 * For each active SheetSync connection (a sheet shared "Anyone with the link"):
 *   1. Re-fetch the sheet via its CSV export.
 *   2. If the row count grew since the last pull, re-run the import — dedup by
 *      phone means only genuinely new leads are inserted (idempotent).
 *   3. Record status + the new row count so an unchanged sheet is a no-op.
 *
 * The connection is created from the import page ("Keep in sync"), which also
 * runs the first import and seeds last_row_count. This job only picks up rows
 * added afterwards.
 */

const MAX_CONFIGS_PER_RUN = 50

export const sheetsSyncFn = inngest.createFunction(
  { id: "sheets-sync", name: "Google Sheets Sync", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step, logger }) => {
    await step.run("record-job-run", () => recordJobRun("sheets-sync"))

    const configs = await step.run("load-sheet-syncs", async () => {
      try {
        return await prisma.sheetSync.findMany({
          where: { is_active: true },
          orderBy: { last_synced_at: "asc" },   // stalest first
          take: MAX_CONFIGS_PER_RUN,
        })
      } catch {
        logger.info("sheet_syncs table not found — skipping (run the sheet_sync migration)")
        return []
      }
    })

    if (configs.length === 0) {
      logger.info("Sheets sync: no active connections")
      return { checked: 0, synced: 0, inserted: 0 }
    }

    let synced = 0
    let totalInserted = 0

    for (const config of configs) {
      const outcome = await step.run(`sync-${config.id}`, async () => {
        const fetched = await fetchSheetRows(config.sheet_url)
        if (!fetched.ok) {
          await prisma.sheetSync.update({
            where: { id: config.id },
            data: { last_synced_at: new Date(), last_status: (fetched.error ?? "fetch failed").slice(0, 200) },
          })
          return { inserted: 0, changed: false }
        }

        const count = fetched.rows.length

        // No new rows since last pull → cheap no-op.
        if (count <= config.last_row_count) {
          await prisma.sheetSync.update({
            where: { id: config.id },
            data: { last_synced_at: new Date(), last_status: "ok", last_row_count: count },
          })
          return { inserted: 0, changed: false }
        }

        // Source + stage must still exist in the workspace.
        const [source, stage] = await Promise.all([
          prisma.leadSource.findFirst({ where: { id: config.source_id, account_id: config.account_id, workspace_id: config.workspace_id } }),
          prisma.pipelineStage.findFirst({ where: { id: config.stage_id, account_id: config.account_id, workspace_id: config.workspace_id } }),
        ])
        if (!source || !stage) {
          await prisma.sheetSync.update({
            where: { id: config.id },
            data: { last_synced_at: new Date(), last_status: "Source or stage was deleted — reconnect the sheet" },
          })
          return { inserted: 0, changed: false }
        }

        const result = await runSheetImport({
          accountId: config.account_id, workspaceId: config.workspace_id, userId: config.user_id,
          sourceId: config.source_id, stageId: config.stage_id,
          source: { key: source.key, intent_baseline: source.intent_baseline },
          rows: fetched.rows,
          name: `Sheet sync · ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
          fileName: "Google Sheet (auto-sync)",
          eventSource: "google_sheets_sync",
        })

        await prisma.sheetSync.update({
          where: { id: config.id },
          data: {
            last_synced_at: new Date(),
            last_status:    result.limitReached ? "Lead limit reached — some rows skipped" : "ok",
            last_row_count: count,
            total_synced:   { increment: result.inserted },
          },
        })
        return { inserted: result.inserted, changed: true }
      })

      if (outcome.changed) synced++
      totalInserted += outcome.inserted
    }

    logger.info(`Sheets sync: ${configs.length} checked, ${synced} pulled, ${totalInserted} new leads`)
    return { checked: configs.length, synced, inserted: totalInserted }
  },
)
