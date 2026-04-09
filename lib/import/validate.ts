import { normalisePhone } from "./phone-normalise"
import { mapRow } from "./column-mapper"

export interface ValidatedRow {
  first_name:     string
  last_name:      string | null
  phone:          string          // canonical +91XXXXXXXXXX
  phone_raw:      string          // original value from CSV
  email:          string | null
  company_name:   string | null
  designation:    string | null
  city:           string | null
  state:          string | null
  pincode:        string | null
  inquiry_text:   string | null
  expected_value: number | null
}

export type ValidationError =
  | "MISSING_PHONE"
  | "INVALID_PHONE"
  | "MISSING_NAME"

export interface ValidationResult {
  valid:  boolean
  row:    ValidatedRow | null
  errors: ValidationError[]
}

/**
 * Validates and normalises a single mapped CSV row.
 *
 * Rules:
 * - `first_name` is required (falls back to "full name" split if present)
 * - `phone` is required and must normalise to a valid +91 number
 * - All other fields are optional — empty strings become null
 *
 * The input `rawRow` should already have been through `mapRow()`.
 */
export function validateRow(rawRow: Record<string, string>): ValidationResult {
  const mapped = mapRow(rawRow)
  const errors: ValidationError[] = []

  // ── Name ─────────────────────────────────────────────────────────────────
  let firstName = mapped.first_name?.trim() ?? ""
  let lastName  = mapped.last_name?.trim() || null

  // If no first_name but we have a full "name" field, split on last space
  if (!firstName && mapped.name) {
    const parts = mapped.name.trim().split(/\s+/)
    firstName = parts[0]
    if (parts.length > 1) lastName = parts.slice(1).join(" ")
  }

  if (!firstName) errors.push("MISSING_NAME")

  // ── Phone ─────────────────────────────────────────────────────────────────
  const phoneRaw      = mapped.phone ?? ""
  const phoneNormalised = normalisePhone(phoneRaw)

  if (!phoneRaw) {
    errors.push("MISSING_PHONE")
  } else if (!phoneNormalised) {
    errors.push("INVALID_PHONE")
  }

  if (errors.length > 0) {
    return { valid: false, row: null, errors }
  }

  // ── Expected value ────────────────────────────────────────────────────────
  let expectedValue: number | null = null
  if (mapped.expected_value) {
    const digits = mapped.expected_value.replace(/[^0-9.]/g, "")
    const parsed = parseFloat(digits)
    if (!isNaN(parsed) && parsed > 0) expectedValue = Math.round(parsed)
  }

  // ── Pincode ───────────────────────────────────────────────────────────────
  // Accept only 6-digit Indian pincodes
  const rawPincode = mapped.pincode?.replace(/\D/g, "") ?? ""
  const pincode    = rawPincode.length === 6 ? rawPincode : null

  return {
    valid: true,
    errors: [],
    row: {
      first_name:     firstName,
      last_name:      lastName,
      phone:          phoneNormalised,
      phone_raw:      phoneRaw,
      email:          sanitiseEmail(mapped.email) ?? null,
      company_name:   mapped.company_name?.trim() || null,
      designation:    mapped.designation?.trim() || null,
      city:           mapped.city?.trim() || null,
      state:          mapped.state?.trim() || null,
      pincode,
      inquiry_text:   mapped.inquiry_text?.trim() || null,
      expected_value: expectedValue,
    },
  }
}

function sanitiseEmail(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  // Basic format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed
}
