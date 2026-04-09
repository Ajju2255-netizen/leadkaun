import { inngest } from "@/inngest/client"
import { prisma } from "@/lib/prisma"

/**
 * Google Sheets sync job.
 * Cron: every 5 minutes — cron expression: star-slash-5 star star star star
 *
 * Per account with Google Sheets configured:
 * 1. Fetch rows from the connected sheet since last_row_index
 * 2. Trigger import/csv.uploaded equivalent for new rows
 * 3. Update last_row_index on success
 *
 * NOTE: Google Sheets integration config (sheets_url, refresh_token,
 * column_mapping, last_row_index) is stored in `google_sheets_configs`
 * table, created in Phase 7 (Task 7.3). This function is a no-op until
 * Phase 7 connects the first account.
 *
 * TAD ref: Section 6.6
 */

// Minimal type for sheets config rows — full model added in Phase 7
type SheetsConfig = {
  id:               string
  account_id:       string
  sheet_id:         string
  column_mapping:   Record<string, string>
  last_row_index:   number
  source_id:        string
  stage_id:         string
  user_id:          string
}

export const sheetsSyncFn = inngest.createFunction(
  { id: "sheets-sync", name: "Google Sheets Sync", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step, logger }) => {
    // ── Load all active sheets configs ────────────────────────────────────────
    // Phase 7 adds the google_sheets_configs table. Until then this returns [].
    const configs = await step.run("load-sheets-configs", async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (prisma as any).googleSheetsConfig.findMany({
          where: { is_active: true },
          select: {
            id:             true,
            account_id:     true,
            sheet_id:       true,
            column_mapping: true,
            last_row_index: true,
            source_id:      true,
            stage_id:       true,
            user_id:        true,
          },
        })
      } catch {
        // Model not yet migrated — safe to return empty array
        logger.info("google_sheets_configs table not found — skipping sync")
        return []
      }
    })

    if (configs.length === 0) {
      logger.info("Sheets sync: no active configurations")
      return { synced: 0, new_rows: 0 }
    }

    logger.info(`Sheets sync: checking ${configs.length} connected sheets`)

    let totalNewRows = 0
    let synced = 0

    for (const config of configs as SheetsConfig[]) {
      const result = await step.run(`sync-sheet-${config.id}`, async () => {
        // Fetch new rows from Google Sheets API
        const rows = await fetchSheetRows(
          config.sheet_id,
          config.last_row_index,
          config.column_mapping,
        )

        if (rows.length === 0) return { new_rows: 0, updated: false }

        // Fire import event for each batch of new rows (reuse CSV import pipeline)
        await inngest.send({
          name: "import/sheets.rows",
          data: {
            config_id:   config.id,
            account_id:  config.account_id,
            user_id:     config.user_id,
            source_id:   config.source_id,
            stage_id:    config.stage_id,
            rows,
            new_last_row_index: config.last_row_index + rows.length,
          },
        })

        return { new_rows: rows.length, updated: true }
      })

      totalNewRows += result.new_rows
      if (result.updated) synced++
    }

    logger.info(`Sheets sync complete: ${synced} sheets updated, ${totalNewRows} new rows queued`)
    return { synced, new_rows: totalNewRows }
  },
)

/**
 * Fetch rows from Google Sheets API starting after `lastRowIndex`.
 * Returns parsed rows using the column mapping.
 *
 * Full implementation in Phase 7 (lib/import/sheets-poller.ts).
 * This stub exists so the Inngest function registers correctly.
 */
async function fetchSheetRows(
  sheetId:       string,
  lastRowIndex:  number,
  columnMapping: Record<string, string>,
): Promise<Record<string, string>[]> {
  // Phase 7 replaces this with real Google Sheets API calls using
  // lib/import/sheets-poller.ts (OAuth2 token refresh + Sheets v4 API)
  const _sheetId       = sheetId
  const _lastRowIndex  = lastRowIndex
  const _columnMapping = columnMapping
  void _sheetId
  void _lastRowIndex
  void _columnMapping
  return []
}
