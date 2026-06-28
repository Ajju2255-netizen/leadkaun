// ─────────────────────────────────────────────
// DATA FRESHNESS
//
// A lead imported today from a 5-year-old database looks "new" by import date,
// scores poorly, and the user blames the product (FM-22). Freshness fixes the
// perception: we capture roughly how old the SOURCE data is at import, store an
// approximate collection date, and surface an aging indicator that keeps aging
// over time. Separate from Confidence (how much we know) — this is how CURRENT
// what we know is.
//
// Pure & dependency-free so it can be unit-tested and reused on server/client.
// ─────────────────────────────────────────────

export type FreshnessBand = "fresh" | "recent" | "aging" | "stale" | "cold"

export type FreshnessResult = {
  ageDays: number
  band: FreshnessBand
  label: string
  note: string
  /** true when based on an explicit source-collection date; false = inferred from import date. */
  fromSource: boolean
}

const BANDS: { band: FreshnessBand; maxDays: number; label: string }[] = [
  { band: "fresh",  maxDays: 30,  label: "Fresh" },
  { band: "recent", maxDays: 90,  label: "Recent" },
  { band: "aging",  maxDays: 180, label: "Aging" },
  { band: "stale",  maxDays: 365, label: "Stale" },
  // >= 365 → cold
]

function noteFor(band: FreshnessBand, fromSource: boolean): string {
  switch (band) {
    case "fresh":  return fromSource ? "Recently collected data." : "Recently imported."
    case "recent": return "Still reasonably current."
    case "aging":  return "Getting old — contact details may have moved on."
    case "stale":  return "Stale — verify the details before trusting the grade."
    case "cold":   return "Cold (over a year old) — likely outdated; treat with caution."
  }
}

export type FreshnessInput = {
  source_collected_at?: Date | string | null
  imported_at: Date | string
  /** Injectable for tests; defaults to now. */
  now?: Date
}

/**
 * Compute a lead's data freshness. Uses the explicit source-collection date
 * when present, otherwise falls back to the import date (so a fresh import with
 * unknown source age reads as "Fresh", not falsely old).
 */
export function computeFreshness(input: FreshnessInput): FreshnessResult {
  const now = input.now ?? new Date()
  const fromSource = input.source_collected_at != null
  const ref = new Date((fromSource ? input.source_collected_at : input.imported_at) as Date | string)

  const ageDays = Math.max(0, Math.floor((now.getTime() - ref.getTime()) / 86_400_000))
  const hit = BANDS.find((b) => ageDays < b.maxDays)
  const band: FreshnessBand = hit ? hit.band : "cold"
  const label = hit ? hit.label : "Cold"

  return { ageDays, band, label, note: noteFor(band, fromSource), fromSource }
}

// ── Import capture: "How old is this list?" → an approximate collection date ──

export const SOURCE_AGE_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "unknown",     label: "Not sure / recent",   days: null },
  { value: "this_week",   label: "Collected this week",  days: 3 },
  { value: "this_month",  label: "Within a month",       days: 20 },
  { value: "1_3_months",  label: "1–3 months old",       days: 60 },
  { value: "3_12_months", label: "3–12 months old",      days: 180 },
  { value: "over_year",   label: "Over a year old",      days: 400 },
]

/** Map a source-age choice to an approximate collection date (null = unspecified). */
export function sourceAgeToDate(value: string, now: Date = new Date()): Date | null {
  const opt = SOURCE_AGE_OPTIONS.find((o) => o.value === value)
  if (!opt || opt.days == null) return null
  return new Date(now.getTime() - opt.days * 86_400_000)
}
