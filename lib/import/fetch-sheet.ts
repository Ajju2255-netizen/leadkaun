import Papa from "papaparse"
import { mapHeader } from "@/lib/import/column-map"

/**
 * Shared Google Sheets fetch/parse — no OAuth. Reads a sheet that is shared as
 * "Anyone with the link (Viewer)" (or published) via its CSV export endpoint.
 * Used by the one-time import route AND the background auto-sync job so both
 * behave identically.
 */

export function extractSheetId(url: string): string | null {
  return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? null
}

/** Tab gid from the URL (defaults to the first tab). */
export function extractGid(url: string): string {
  return url.match(/[#&?]gid=([0-9]+)/)?.[1] ?? "0"
}

export function sheetCsvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
}

export interface FetchSheetResult {
  ok:    boolean
  rows:  Record<string, string>[]
  error?: string
  code?:  string
}

/**
 * Fetch + parse a shared sheet into rows keyed by the canonical import fields
 * (same header normalisation as a CSV upload). Non-throwing: returns an `ok`
 * flag plus a human-readable error/code on failure.
 */
export async function fetchSheetRows(sheetUrl: string): Promise<FetchSheetResult> {
  const sheetId = extractSheetId(sheetUrl)
  if (!sheetId) {
    return { ok: false, rows: [], error: "That doesn't look like a Google Sheets link — could not find the spreadsheet ID.", code: "INVALID_SHEET_URL" }
  }

  let text: string
  try {
    const res = await fetch(sheetCsvUrl(sheetId, extractGid(sheetUrl)), { redirect: "follow", headers: { Accept: "text/csv" } })
    const ct = res.headers.get("content-type") ?? ""
    text = await res.text()
    // A private sheet redirects to a Google login page (HTML), not CSV.
    const looksHtml = ct.includes("text/html") || /^\s*<(!doctype|html)/i.test(text)
    if (!res.ok || looksHtml) {
      return { ok: false, rows: [], error: "Couldn't read that sheet. Share it as “Anyone with the link (Viewer)” (or File → Share → Publish to web), then try again.", code: "SHEET_NOT_ACCESSIBLE" }
    }
  } catch {
    return { ok: false, rows: [], error: "Couldn't reach Google Sheets. Check the link and your connection, then try again.", code: "SHEET_FETCH_FAILED" }
  }

  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: mapHeader })
  const rows = parsed.data.filter((r) => Object.values(r).some((v) => (v ?? "").toString().trim() !== ""))
  return { ok: true, rows }
}
