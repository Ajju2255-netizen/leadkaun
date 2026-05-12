import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { encrypt } from "@/lib/crypto"

/**
 * Google Sheets Integration Endpoints
 *
 * POST /api/import/sheets — Connect a Google Sheet to this account.
 *   Body: { sheet_url, refresh_token, column_mapping?, source_id, stage_id }
 *   Returns: { configId }
 *   Admin/Manager only.
 *
 * GET /api/import/sheets — Return connection status for this account.
 *   Returns: { connected: boolean, config?: {...} }
 *
 * DELETE /api/import/sheets — Disconnect Google Sheets for this account.
 *
 * NOTE: The `google_sheets_configs` Prisma model is added in the Phase 7
 * migration. Until then, POST returns 501. GET returns { connected: false }.
 */

const ConnectSchema = z.object({
  sheet_url:      z.string().url(),
  refresh_token:  z.string().min(1),
  source_id:      z.string().min(1),
  stage_id:       z.string().min(1),
  column_mapping: z.record(z.string(), z.string()).optional().default({}),
})

/** Extract the spreadsheet ID from a Google Sheets URL */
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

// ── POST /api/import/sheets ────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")

    const { data, error } = await parseBody(req, ConnectSchema)
    if (error) return error

    const sheetId = extractSheetId(data.sheet_url)
    if (!sheetId) {
      return apiError("Invalid Google Sheets URL — could not extract spreadsheet ID", "INVALID_SHEET_URL", 422)
    }

    // Validate source and stage
    const [source, stage] = await Promise.all([
      prisma.leadSource.findFirst({ where: { id: data.source_id, account_id: session.account.id } }),
      prisma.pipelineStage.findFirst({ where: { id: data.stage_id, account_id: session.account.id } }),
    ])
    if (!source) return apiError("Lead source not found", "NOT_FOUND", 404)
    if (!stage)  return apiError("Pipeline stage not found", "NOT_FOUND", 404)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma as any).googleSheetsConfig.findFirst({
        where: { account_id: session.account.id, is_active: true },
      })

      if (existing) {
        // Update existing config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await (prisma as any).googleSheetsConfig.update({
          where: { id: existing.id },
          data: {
            sheet_id:       sheetId,
            sheet_url:      data.sheet_url,
            refresh_token:  encrypt(data.refresh_token),
            column_mapping: data.column_mapping,
            source_id:      data.source_id,
            stage_id:       data.stage_id,
            last_row_index: 0,                    // reset on reconnect
            updated_by:     session.user.id,
          },
        })
        return apiSuccess({ configId: updated.id })
      }

      // Create new config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = await (prisma as any).googleSheetsConfig.create({
        data: {
          account_id:     session.account.id,
          sheet_id:       sheetId,
          sheet_url:      data.sheet_url,
          refresh_token:  encrypt(data.refresh_token),
          column_mapping: data.column_mapping,
          source_id:      data.source_id,
          stage_id:       data.stage_id,
          user_id:        session.user.id,
          last_row_index: 0,
          is_active:      true,
        },
      })
      return apiSuccess({ configId: config.id }, 201)
    } catch (modelError: unknown) {
      // Model not yet migrated
      if (
        typeof modelError === "object" &&
        modelError !== null &&
        "message" in modelError &&
        typeof (modelError as { message: string }).message === "string" &&
        (modelError as { message: string }).message.includes("does not exist")
      ) {
        return apiError(
          "Google Sheets integration not yet available — run Phase 7 migration",
          "NOT_IMPLEMENTED",
          500,
        )
      }
      throw modelError
    }
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Sheets connect error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

// ── GET /api/import/sheets ─────────────────────────────────────────────────
export async function GET(_req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = await (prisma as any).googleSheetsConfig.findFirst({
        where: { account_id: session.account.id, is_active: true },
        select: {
          id:             true,
          sheet_url:      true,
          last_row_index: true,
          is_active:      true,
          created_at:     true,
          source:         { select: { id: true, name: true } },
          stage:          { select: { id: true, name: true } },
        },
      })

      if (!config) return apiSuccess({ connected: false })
      return apiSuccess({ connected: true, config })
    } catch {
      return apiSuccess({ connected: false })
    }
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

// ── DELETE /api/import/sheets ──────────────────────────────────────────────
export async function DELETE(_req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = await (prisma as any).googleSheetsConfig.findFirst({
        where: { account_id: session.account.id, is_active: true },
      })

      if (!config) return apiError("No active Google Sheets connection found", "NOT_FOUND", 404)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).googleSheetsConfig.update({
        where: { id: config.id },
        data:  { is_active: false },
      })

      return apiSuccess({ disconnected: true })
    } catch {
      return apiError("Google Sheets integration not configured", "NOT_FOUND", 404)
    }
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
