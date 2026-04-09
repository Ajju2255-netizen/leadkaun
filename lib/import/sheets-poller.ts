/**
 * Google Sheets poller — lib/import/sheets-poller.ts
 *
 * Fetches new rows from a connected Google Sheet using the Sheets v4 API.
 * Handles OAuth2 token refresh transparently.
 *
 * Called by the sheets-sync Inngest function (inngest/functions/sheets-sync.ts)
 * every 5 minutes per connected account.
 *
 * TAD ref: Section 6.6, Phase 7 Task 7.3
 */

import { mapRow } from "./column-mapper"

export interface SheetRow {
  [field: string]: string
}

export interface PollResult {
  rows:          SheetRow[]
  newLastIndex:  number
}

export interface SheetsConfig {
  sheetId:        string
  refreshToken:   string
  columnMapping:  Record<string, string>   // overrides for this account's column names
  lastRowIndex:   number                   // 0-based, last row already processed
}

// Google OAuth2 token endpoint
const TOKEN_URL = "https://oauth2.googleapis.com/token"
// Google Sheets API base
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

/**
 * Refresh an OAuth2 access token using the stored refresh token.
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId     = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token refresh failed: ${body}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

/**
 * Fetch rows from a Google Sheet starting after `lastRowIndex`.
 *
 * The first row (index 0) is treated as the header row.
 * `lastRowIndex` is the last data row already processed (0 = nothing processed yet,
 * meaning rows starting from index 1 — the first data row after the header).
 *
 * Returns parsed rows as mapped field objects plus the new last row index.
 */
export async function pollSheetRows(config: SheetsConfig): Promise<PollResult> {
  const accessToken = await refreshAccessToken(config.refreshToken)

  // Calculate the A1 range to fetch — start from the row after the last processed
  // Row 1 = headers, Row 2 = first data row. lastRowIndex is 0-based for data rows.
  const startRow = config.lastRowIndex + 2  // +1 for header, +1 for next unprocessed
  const range    = `A${startRow}:Z`          // fetch all columns from startRow onward

  const url = `${SHEETS_BASE}/${config.sheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sheets API fetch failed: ${body}`)
  }

  const data = await res.json() as {
    values?: string[][]
    range?: string
  }

  if (!data.values || data.values.length === 0) {
    return { rows: [], newLastIndex: config.lastRowIndex }
  }

  // Fetch headers separately (always row 1)
  const headerUrl = `${SHEETS_BASE}/${config.sheetId}/values/${encodeURIComponent("A1:Z1")}?majorDimension=ROWS`
  const headerRes = await fetch(headerUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!headerRes.ok) throw new Error("Failed to fetch sheet headers")
  const headerData = await headerRes.json() as { values?: string[][] }
  const headers    = headerData.values?.[0] ?? []

  // Map each data row to { header: value } then through column mapper
  const rows: SheetRow[] = data.values.map((rowValues) => {
    const rawRow: Record<string, string> = {}
    headers.forEach((header, i) => {
      rawRow[header] = rowValues[i] ?? ""
    })
    // Apply column mapping overrides on top of default mapping
    const overrideRow: Record<string, string> = {}
    for (const [key, value] of Object.entries(rawRow)) {
      const overriddenKey = config.columnMapping[key] ?? key
      overrideRow[overriddenKey] = value
    }
    return mapRow(overrideRow)
  })

  const newLastIndex = config.lastRowIndex + data.values.length

  return { rows, newLastIndex }
}
