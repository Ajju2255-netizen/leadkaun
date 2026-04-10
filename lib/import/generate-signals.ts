import type { SignalType } from "@prisma/client"
import { SIGNAL_WEIGHTS } from "@/lib/scoring/signal-weights"

// The 8 import-inference signal types were added to the Prisma schema in
// migration 20260410000000_import_signal_types.  The local @prisma/client
// may be stale if `prisma generate` has not been run with real env vars.
// Cast helpers bridge that gap; at runtime the DB enum is always up-to-date.
const T = (s: string) => s as unknown as SignalType

/**
 * Import signal generation — pure function, no DB calls.
 *
 * Reads available CSV fields and returns a list of signal descriptors
 * that should be inserted for the newly-created lead.  The caller owns
 * all DB writes so that atomicity can be enforced inside the import
 * transaction.
 *
 * Rules (applied in order; all matching rules fire — they are additive):
 *
 *   interest_level
 *     "high"   → IMPORT_HIGH_INTENT     (+40)
 *     "medium" → IMPORT_MEDIUM_INTENT   (+20)
 *     "low"    → IMPORT_LOW_INTENT      (+5)
 *
 *   last_contact_days
 *     0–1  → IMPORT_RECENT_CONTACT  (+30)
 *     2–3  → IMPORT_WARM_CONTACT    (+15)
 *     > 5  → IMPORT_STALE_CONTACT   (-20)
 *     (4–5 days is neutral — no signal generated)
 *
 *   notes (case-insensitive keyword scan)
 *     "demo" | "call" | "callback" → IMPORT_ACTIVE_INTEREST (+30)
 *     "not interested" | "no response" → IMPORT_NEGATIVE_SIGNAL (-25)
 *     Note: both positive and negative CAN match the same notes string.
 *     They are summed, which is correct — ambiguous notes reduce the boost.
 *
 * Design constraints:
 *   • No side-effects. Returns a plain array.
 *   • signal_value is taken from SIGNAL_WEIGHTS — single source of truth.
 *   • Duplicate-safe: one signal per applicable rule per import call.
 *     The caller must not call this more than once per lead.
 */

export interface ImportSignalDescriptor {
  signal_type:  SignalType
  signal_value: number
}

export interface ImportSignalInput {
  /** Raw string value from the CSV "interest_level" column */
  interest_level?: string | null
  /** Integer parsed from the CSV "last_contact_days" column */
  last_contact_days?: number | null
  /** Full notes / remarks text from the CSV row */
  notes?: string | null
}

export function generateImportSignals(input: ImportSignalInput): ImportSignalDescriptor[] {
  const signals: ImportSignalDescriptor[] = []

  // ── interest_level ─────────────────────────────────────────────────────────
  const interest = input.interest_level?.trim().toLowerCase()
  if (interest === "high") {
    signals.push(make(T("IMPORT_HIGH_INTENT")))
  } else if (interest === "medium" || interest === "med") {
    signals.push(make(T("IMPORT_MEDIUM_INTENT")))
  } else if (interest === "low") {
    signals.push(make(T("IMPORT_LOW_INTENT")))
  }

  // ── last_contact_days ──────────────────────────────────────────────────────
  const days = input.last_contact_days
  if (days !== null && days !== undefined && !isNaN(days)) {
    if (days <= 1) {
      signals.push(make(T("IMPORT_RECENT_CONTACT")))
    } else if (days <= 3) {
      signals.push(make(T("IMPORT_WARM_CONTACT")))
    } else if (days > 5) {
      signals.push(make(T("IMPORT_STALE_CONTACT")))
    }
    // days 4–5: neutral gap — no signal
  }

  // ── notes keyword scan ─────────────────────────────────────────────────────
  const notes = input.notes?.toLowerCase() ?? ""
  if (notes) {
    const hasPositiveKeyword = /\b(demo|call|callback|follow.?up|interested|urgent|ready|site.?visit)\b/.test(notes)
    const hasNegativeKeyword = /not\s+interested|no\s+response|wrong\s+number|do\s+not\s+contact|dnd|unsubscribe/.test(notes)

    if (hasPositiveKeyword) signals.push(make(T("IMPORT_ACTIVE_INTEREST")))
    if (hasNegativeKeyword) signals.push(make(T("IMPORT_NEGATIVE_SIGNAL")))
  }

  return signals
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function make(type: SignalType): ImportSignalDescriptor {
  // SIGNAL_WEIGHTS may not contain the new types in a stale local build.
  // Fall back to 0 so the function never throws; on Vercel the map is complete.
  const value = (SIGNAL_WEIGHTS as Record<string, number>)[type as string] ?? 0
  return { signal_type: type, signal_value: value }
}
