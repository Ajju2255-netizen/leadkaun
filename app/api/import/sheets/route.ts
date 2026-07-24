import { z } from "zod"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { mapHeader } from "@/lib/import/column-map"
import { processImportRows } from "@/lib/import/process-rows"
import { getLeadUsage, leadsRemaining } from "@/lib/billing/lead-usage"
import { recordAccountEvent } from "@/lib/events/account-events"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"
// One synchronous pull: fetch the sheet, parse, insert. Give it headroom.
export const maxDuration = 300

/**
 * POST /api/import/sheets — one-time import from a shared Google Sheet URL.
 *
 * Body: { sheet_url, source_id, stage_id, name?, source_collected_at? }
 * The sheet must be shared as "Anyone with the link (Viewer)" or published to
 * the web — we fetch its CSV export (no OAuth) and run the rows through the same
 * validate → dedupe → score pipeline as a CSV upload. Re-run to pull again.
 *
 * Admin/Manager only.
 */

const ImportSchema = z.object({
  sheet_url:           z.string().url(),
  source_id:           z.string().min(1),
  stage_id:            z.string().min(1),
  name:                z.string().trim().max(120).optional(),
  source_collected_at: z.string().optional().nullable(),
})

// One synchronous pull processes at most this many rows — a transaction per row
// keeps us well under maxDuration. Larger sheets: split, or export to CSV.
const SHEET_PULL_MAX = 2000
const CHUNK = 100

/** Extract the spreadsheet ID from a Google Sheets URL. */
function extractSheetId(url: string): string | null {
  return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? null
}

/** Extract the tab gid from a Google Sheets URL (defaults to the first tab). */
function extractGid(url: string): string {
  return url.match(/[#&?]gid=([0-9]+)/)?.[1] ?? "0"
}

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

    // Up-front lead cap (the loop below enforces the exact ceiling).
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

    // ── Fetch the sheet's CSV export ─────────────────────────────────────────
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${extractGid(data.sheet_url)}`
    let csvText: string
    try {
      const res = await fetch(csvUrl, { redirect: "follow", headers: { Accept: "text/csv" } })
      const ct = res.headers.get("content-type") ?? ""
      csvText = await res.text()
      // A private sheet redirects to a Google login page (HTML), not CSV.
      const looksHtml = ct.includes("text/html") || /^\s*<(!doctype|html)/i.test(csvText)
      if (!res.ok || looksHtml) {
        return apiError(
          "Couldn't read that sheet. Share it as “Anyone with the link (Viewer)” (or File → Share → Publish to web), then try again.",
          "SHEET_NOT_ACCESSIBLE",
          422,
        )
      }
    } catch {
      return apiError("Couldn't reach Google Sheets. Check the link and your connection, then try again.", "SHEET_FETCH_FAILED", 502)
    }

    // ── Parse (same header normalisation as CSV upload) ──────────────────────
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true, skipEmptyLines: true, transformHeader: mapHeader,
    })
    const allRows = parsed.data.filter((r) => Object.values(r).some((v) => (v ?? "").toString().trim() !== ""))
    if (allRows.length === 0) {
      return apiError("That sheet has no data rows (need a header row plus at least one lead).", "EMPTY_SHEET", 422)
    }

    const truncatedBySize = allRows.length > SHEET_PULL_MAX
    const remaining = await leadsRemaining(session.account.id)
    const rows = allRows.slice(0, Math.min(SHEET_PULL_MAX, Math.max(0, remaining) || SHEET_PULL_MAX))

    const scRaw = data.source_collected_at ? new Date(data.source_collected_at) : null
    const sourceCollectedAt = scRaw && !isNaN(scRaw.getTime()) ? scRaw : null

    // ── Create the import job ────────────────────────────────────────────────
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    const job = await prisma.importJobStatus.create({
      data: {
        account_id: session.account.id, workspace_id: session.workspace.id, user_id: session.user.id,
        status: "PROCESSING", total_rows: rows.length, progress_pct: 0,
        inserted: 0, duplicates: 0, errors: 0,
        name: data.name?.trim() || `Google Sheet · ${dateStr} · ${source.name}`,
        file_name: "Google Sheet", source_id: data.source_id,
      },
    })

    // ── Process in chunks (transaction per row inside processImportRows) ─────
    let inserted = 0, duplicates = 0, errors = 0, highIntentCount = 0, totalValue = 0
    const errorReasons: string[] = []
    let limitReached = false

    for (let i = 0; i < rows.length; i += CHUNK) {
      const left = await leadsRemaining(session.account.id)
      if (left <= 0) { limitReached = true; break }
      const slice = rows.slice(i, i + CHUNK)
      const capped = left < slice.length ? slice.slice(0, left) : slice
      if (capped.length < slice.length) limitReached = true

      const r = await processImportRows({
        rows: capped, startRowIndex: i + 2,
        accountId: session.account.id, workspaceId: session.workspace.id,
        sourceId: data.source_id, stageId: data.stage_id, jobId: job.id,
        source: { key: source.key, intent_baseline: source.intent_baseline },
        sourceCollectedAt,
      })
      inserted += r.inserted; duplicates += r.duplicates; errors += r.errors
      highIntentCount += r.highIntentCount; totalValue += r.totalValue
      for (const reason of r.errorReasons) if (errorReasons.length < 100) errorReasons.push(reason)

      await prisma.importJobStatus.update({
        where: { id: job.id },
        data: {
          inserted: { increment: r.inserted }, duplicates: { increment: r.duplicates },
          errors: { increment: r.errors }, high_intent_count: { increment: r.highIntentCount },
          total_value: { increment: r.totalValue },
          progress_pct: Math.min(99, Math.round(((i + capped.length) / rows.length) * 100)),
        },
      })
      if (limitReached) break
    }

    // ── Finalise ─────────────────────────────────────────────────────────────
    await prisma.importJobStatus.update({
      where: { id: job.id },
      data: {
        status: "COMPLETE", progress_pct: 100, completed_at: new Date(),
        ...(errorReasons.length > 0 && {
          error_detail: { total_errors: errors, shown: errorReasons.length, truncated: errors > errorReasons.length, rows: errorReasons },
        }),
      },
    })
    await recordAccountEvent({
      accountId: session.account.id, workspaceId: session.workspace.id, actorUserId: session.user.id,
      type: "IMPORT_COMPLETED",
      summary: `Imported ${inserted} leads from Google Sheets${duplicates ? `, ${duplicates} duplicates` : ""}`,
      detail: { inserted, duplicates, errors, source: "google_sheets" },
    })

    return apiSuccess({
      jobId: job.id,
      inserted, duplicates, errors,
      high_intent_count: highIntentCount, total_value: totalValue,
      total_rows: rows.length,
      sheet_total_rows: allRows.length,
      truncated: truncatedBySize,
      limitReached,
      errorDetail: errorReasons.length > 0
        ? { total_errors: errors, shown: errorReasons.length, truncated: errors > errorReasons.length, rows: errorReasons }
        : null,
    }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Sheets import error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
