import { normalisePhone } from "./phone-normalise"

/**
 * Per-row validation and normalisation for CSV import.
 *
 * Design principles:
 *   • Only name + phone are required.  Every other field is optional.
 *   • Validation never throws — it returns a typed result union.
 *   • Normalisation is applied before validation so minor formatting
 *     differences (casing, whitespace, missing country code) never
 *     cause a row to fail.
 *   • Error messages name the exact field and the exact value that
 *     failed so they can be surfaced to the user.
 *
 * Called once per CSV row, after header mapping.
 */

// ── Output types ──────────────────────────────────────────────────────────────

export interface ValidatedRow {
  first_name:        string
  last_name:         string | null
  phone:             string          // canonical +91XXXXXXXXXX
  phone_raw:         string          // original value before normalisation
  email:             string | null
  company_name:      string | null
  designation:       string | null
  city:              string | null
  state:             string | null
  pincode:           string | null
  inquiry_text:      string | null
  expected_value:    number | null
  // Import-inference fields (passed through to generateImportSignals)
  interest_level:    string | null   // normalised: "high" | "medium" | "low" | null
  last_contact_days: number | null
}

export type RowValidationResult =
  | { ok: true;  data: ValidatedRow }
  | { ok: false; reason: string }

// ── Row-level validator ───────────────────────────────────────────────────────

export function validateRow(
  raw: Record<string, string>,
  rowIndex: number,
): RowValidationResult {

  // ── 1. Extract name ────────────────────────────────────────────────────────
  // Accept: first_name alone, or full_name/name which we'll split on first space.
  const rawName = str(raw.first_name ?? raw.full_name ?? raw.name ?? raw.customer_name ?? raw.lead_name)

  if (!rawName) {
    const foundCols = Object.keys(raw).filter((k) => raw[k]?.trim()).join(", ") || "(none)"
    return {
      ok: false,
      reason: `Row ${rowIndex}: missing required field "name" — columns found: ${foundCols}`,
    }
  }

  // If the name looks like "First Last", split it; otherwise treat as first_name only.
  let firstName: string
  let lastName: string | null = null

  const nameParts = rawName.trim().split(/\s+/)
  if (nameParts.length >= 2) {
    firstName = nameParts[0]
    lastName  = nameParts.slice(1).join(" ")
  } else {
    firstName = nameParts[0]
  }

  // Override with explicit last_name column if present
  const explicitLast = str(raw.last_name ?? raw.surname)
  if (explicitLast) lastName = explicitLast

  if (!firstName) {
    return {
      ok: false,
      reason: `Row ${rowIndex}: "name" is blank after trimming ("${rawName}")`,
    }
  }

  // ── 2. Extract + normalise phone ───────────────────────────────────────────
  const rawPhone = str(
    raw.phone ?? raw.mobile ?? raw.mobile_number ?? raw.phone_number ??
    raw.contact ?? raw.contact_number ?? raw.cell ?? raw.telephone ?? raw.tel
  )

  if (!rawPhone) {
    const foundCols = Object.keys(raw).filter((k) => raw[k]?.trim()).join(", ") || "(none)"
    return {
      ok: false,
      reason: `Row ${rowIndex} ("${firstName}"): missing required field "phone" — columns found: ${foundCols}`,
    }
  }

  const phone = normalisePhone(rawPhone)

  if (!phone) {
    // Give a specific reason based on what we found
    const digits = rawPhone.replace(/\D/g, "")
    let hint: string

    if (!digits) {
      hint = "no digits found"
    } else if (digits.length < 10) {
      hint = `only ${digits.length} digits (need 10)`
    } else if (digits.length === 10 && !/^[6-9]/.test(digits)) {
      hint = `starts with "${digits[0]}" — Indian mobiles must start with 6–9`
    } else {
      hint = "unrecognised format"
    }

    return {
      ok: false,
      reason: `Row ${rowIndex} ("${firstName}"): invalid phone "${rawPhone}" — ${hint}`,
    }
  }

  // ── 3. Optional fields — trim + null-coerce ────────────────────────────────
  const email       = emailOrNull(str(raw.email))
  const companyName = strOrNull(raw.company_name ?? raw.company ?? raw.organisation ?? raw.organization)
  const designation = strOrNull(raw.designation ?? raw.role ?? raw.job_title ?? raw.position ?? raw.title)
  const city        = strOrNull(raw.city ?? raw.town ?? raw.district)
  const state       = strOrNull(raw.state ?? raw.province)
  const pincode     = strOrNull(raw.pincode ?? raw.pin ?? raw.zip)
  const inquiryText = strOrNull(
    raw.inquiry_text ?? raw.inquiry ?? raw.notes ?? raw.description ??
    raw.message ?? raw.remarks ?? raw.comments ?? raw.requirement
  )
  const expectedValue = parseRupee(
    raw.expected_value ?? raw.budget ?? raw.value ?? raw.deal_value ?? raw.amount
  )

  // ── 4. Import-inference fields ─────────────────────────────────────────────
  const interestLevel    = normaliseInterestLevel(raw.interest_level ?? raw.interest ?? raw.intent ?? raw.priority)
  const lastContactDays  = parseContactDays(raw.last_contact_days ?? raw.last_contact ?? raw.follow_up_days)

  return {
    ok: true,
    data: {
      first_name:        firstName,
      last_name:         lastName,
      phone,
      phone_raw:         rawPhone,
      email,
      company_name:      companyName,
      designation,
      city,
      state,
      pincode,
      inquiry_text:      inquiryText,
      expected_value:    expectedValue,
      interest_level:    interestLevel,
      last_contact_days: lastContactDays,
    },
  }
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

/** Trim + return empty string as undefined */
function str(v: string | undefined): string {
  return (v ?? "").trim()
}

/** Trim + return null if blank */
function strOrNull(v: string | undefined): string | null {
  const s = str(v)
  return s || null
}

/** Validate a basic email shape; return null if invalid */
function emailOrNull(v: string): string | null {
  if (!v) return null
  // Minimal check: contains @ and a dot after the @
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null
}

/**
 * Normalise interest_level to one of: "high" | "medium" | "low" | null.
 *
 * Accepts many real-world variations:
 *   HIGH, High, H, 3, Hot, Very Interested   → "high"
 *   MEDIUM, Medium, Med, M, 2, Warm           → "medium"
 *   LOW, Low, L, 1, Cold, Not Interested      → "low"
 */
function normaliseInterestLevel(v: string | undefined): "high" | "medium" | "low" | null {
  const s = str(v).toLowerCase()
  if (!s) return null

  if (/^(high|hi|h|3|hot|very\s+interested|very\s+high|strong)$/.test(s)) return "high"
  if (/^(medium|med|m|2|warm|moderate|average|neutral)$/.test(s))          return "medium"
  if (/^(low|lo|l|1|cold|not\s+interested|poor|weak)$/.test(s))            return "low"

  // Partial match fallback for free-text values
  if (s.includes("high") || s.includes("hot"))       return "high"
  if (s.includes("med") || s.includes("warm"))       return "medium"
  if (s.includes("low") || s.includes("cold"))       return "low"

  return null  // unrecognised — treat as no signal rather than wrong signal
}

/**
 * Parse last_contact_days — accepts integers, floats (floored), and
 * common text values ("today" → 0, "yesterday" → 1, "never" → null).
 */
function parseContactDays(v: string | undefined): number | null {
  const s = str(v).toLowerCase()
  if (!s) return null

  if (s === "today" || s === "0")     return 0
  if (s === "yesterday")              return 1
  if (s === "never" || s === "n/a")   return null

  const n = parseInt(s.replace(/[^0-9]/g, ""), 10)
  return isNaN(n) ? null : n
}

/**
 * Parse Indian rupee amounts.  Strips currency symbols, lakhs/crores
 * suffixes, and commas.  Returns null if unparseable or zero.
 *
 * Examples: "₹1,50,000" → 150000  |  "2.5L" → 250000  |  "1Cr" → 10000000
 */
function parseRupee(v: string | undefined): number | null {
  const s = str(v).replace(/[₹,\s]/g, "").toLowerCase()
  if (!s) return null

  let n: number

  if (s.endsWith("cr") || s.endsWith("crore")) {
    n = parseFloat(s) * 10_000_000
  } else if (s.endsWith("l") || s.endsWith("lac") || s.endsWith("lakh")) {
    n = parseFloat(s) * 100_000
  } else if (s.endsWith("k")) {
    n = parseFloat(s) * 1_000
  } else {
    n = parseInt(s.replace(/[^0-9]/g, ""), 10)
  }

  return isNaN(n) || n <= 0 ? null : n
}
