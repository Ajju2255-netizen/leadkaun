import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { fetchSheetRows, extractSheetId, extractGid } from "@/lib/import/fetch-sheet"
import { runSheetImport, SHEET_PULL_MAX } from "@/lib/import/run-sheet-import"
import { getLeadUsage } from "@/lib/billing/lead-usage"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"
// One synchronous pull: fetch the sheet, parse, insert. Give it headroom.
export const maxDuration = 300

/**
 * Google Sheets import — no OAuth. The sheet must be shared as "Anyone with the
 * link (Viewer)" or published; we read its CSV export and run the rows through
 * the same validate → dedupe → score pipeline as a CSV upload.
 *
 * POST   /api/import/sheets — pull now. With { keep_in_sync: true } also persists
 *        the connection so the cron re-pulls new rows every few minutes.
 * GET    /api/import/sheets — the active auto-sync connection (or { connected:false }).
 * DELETE /api/import/sheets — stop auto-syncing.
 *
 * Admin/Manager only.
 */

const ImportSchema = z.object({
  sheet_url:           z.string().url(),
  source_id:           z.string().min(1),
  stage_id:            z.string().min(1),
  name:                z.string().trim().max(120).optional(),
  source_collected_at: z.string().optional().nullable(),
  keep_in_sync:        z.boolean().optional().default(false),
})

// ── POST /api/import/sheets — pull now (+ optionally keep in sync) ───────────
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")

    const _rl = await rateLimited(`import:sheets:${session.account.id}`, LIMITS.importInit)
    if (_rl) return _rl

    const { data, error } = await parseBody(req, ImportSchema)
    if (error) return error

    const sheetId = extractSheetId(data.sheet_url)
    if (!sheetId) {
      return apiError("That doesn't look like a Google Sheets link — could not find the spreadsheet ID.", "INVALID_SHEET_URL", 422)
    }

    // Up-front lead cap (runSheetImport enforces the exact ceiling per chunk).
    const usage = await getLeadUsage(session.account.id)
    if (usage.isOver) {
      return apiError(
        `Your ${usage.planName} workspace has reached its limit of ${usage.limit?.toLocaleString("en-IN")} active leads. Close or remove some, or upgrade, to import more.`,
        "LEAD_LIMIT_REACHED",
        403,
      )
    }

    // Source + stage must belong to this workspace.
    const [source, stage] = await Promise.all([
      prisma.leadSource.findFirst({ where: { id: data.source_id, account_id: session.account.id, workspace_id: session.workspace.id } }),
      prisma.pipelineStage.findFirst({ where: { id: data.stage_id, account_id: session.account.id, workspace_id: session.workspace.id } }),
    ])
    if (!source) return apiError("Lead source not found", "NOT_FOUND", 404)
    if (!stage)  return apiError("Pipeline stage not found", "NOT_FOUND", 404)

    // Fetch + parse the sheet.
    const fetched = await fetchSheetRows(data.sheet_url)
    if (!fetched.ok) return apiError(fetched.error ?? "Couldn't read that sheet.", fetched.code ?? "SHEET_ERROR", 422)
    if (fetched.rows.length === 0) {
      return apiError("That sheet has no data rows (need a header row plus at least one lead).", "EMPTY_SHEET", 422)
    }
    const sheetTotal = fetched.rows.length
    const truncated  = sheetTotal > SHEET_PULL_MAX

    const scRaw = data.source_collected_at ? new Date(data.source_collected_at) : null
    const sourceCollectedAt = scRaw && !isNaN(scRaw.getTime()) ? scRaw : null
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })

    const result = await runSheetImport({
      accountId: session.account.id, workspaceId: session.workspace.id, userId: session.user.id,
      sourceId: data.source_id, stageId: data.stage_id,
      source: { key: source.key, intent_baseline: source.intent_baseline },
      rows: fetched.rows,
      name: data.name?.trim() || `Google Sheet · ${dateStr} · ${source.name}`,
      sourceCollectedAt, eventSource: "google_sheets",
    })

    // Persist the connection for auto-sync (idempotent per workspace). Best-effort:
    // if the table isn't migrated yet, the one-time import still succeeds.
    let connected = false
    if (data.keep_in_sync) {
      try {
        const existing = await prisma.sheetSync.findFirst({
          where: { account_id: session.account.id, workspace_id: session.workspace.id, is_active: true },
        })
        const fields = {
          sheet_url: data.sheet_url, sheet_id: sheetId, gid: extractGid(data.sheet_url),
          source_id: data.source_id, stage_id: data.stage_id, user_id: session.user.id,
          is_active: true, last_row_count: sheetTotal, last_synced_at: new Date(), last_status: "ok",
        }
        if (existing) {
          await prisma.sheetSync.update({ where: { id: existing.id }, data: fields })
        } else {
          await prisma.sheetSync.create({
            data: { account_id: session.account.id, workspace_id: session.workspace.id, ...fields },
          })
        }
        connected = true
      } catch (e) {
        console.error("SheetSync persist failed (table migrated?):", e)
      }
    }

    return apiSuccess({
      jobId: result.jobId,
      inserted: result.inserted, duplicates: result.duplicates, errors: result.errors,
      high_intent_count: result.highIntentCount, total_value: result.totalValue,
      total_rows: Math.min(sheetTotal, SHEET_PULL_MAX),
      sheet_total_rows: sheetTotal,
      truncated, limitReached: result.limitReached,
      connected,
      errorDetail: result.errorReasons.length > 0
        ? { total_errors: result.errors, shown: result.errorReasons.length, truncated: result.errors > result.errorReasons.length, rows: result.errorReasons }
        : null,
    }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Sheets import error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

// ── GET /api/import/sheets — active auto-sync connection ─────────────────────
export async function GET() {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")
    try {
      const sync = await prisma.sheetSync.findFirst({
        where: { account_id: session.account.id, workspace_id: session.workspace.id, is_active: true },
        select: {
          id: true, sheet_url: true, last_synced_at: true, last_status: true,
          total_synced: true, last_row_count: true, created_at: true,
        },
      })
      if (!sync) return apiSuccess({ connected: false })
      return apiSuccess({ connected: true, sync })
    } catch {
      // Table not migrated yet — treat as not connected.
      return apiSuccess({ connected: false })
    }
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

// ── DELETE /api/import/sheets — stop auto-syncing ────────────────────────────
export async function DELETE() {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")
    const _rl = await rateLimited(`import:sheets:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl
    try {
      const sync = await prisma.sheetSync.findFirst({
        where: { account_id: session.account.id, workspace_id: session.workspace.id, is_active: true },
      })
      if (!sync) return apiError("No active Google Sheets connection found", "NOT_FOUND", 404)
      await prisma.sheetSync.update({ where: { id: sync.id }, data: { is_active: false } })
      return apiSuccess({ disconnected: true })
    } catch {
      return apiError("Google Sheets sync is not configured", "NOT_FOUND", 404)
    }
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
