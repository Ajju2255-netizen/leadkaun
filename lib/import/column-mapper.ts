/**
 * CSV column mapper.
 *
 * Maps arbitrary CSV header names to Lead model field names.
 * Handles common variations found in Indian CRM exports, Facebook Lead Ads,
 * IndiaMart, Sulekha, Just Dial, and manual spreadsheets.
 *
 * The mapping is case-insensitive and strips extra whitespace.
 * Unknown columns pass through as-is (snake_cased).
 */

/** Canonical Lead field names that the import pipeline understands */
export type LeadField =
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "company_name"
  | "designation"
  | "city"
  | "state"
  | "pincode"
  | "inquiry_text"
  | "expected_value"

const COLUMN_MAP: Record<string, LeadField> = {
  // Name variations
  "first name":          "first_name",
  "firstname":           "first_name",
  "first_name":          "first_name",
  "name":                "first_name",
  "full name":           "first_name",
  "fullname":            "first_name",
  "customer name":       "first_name",
  "contact name":        "first_name",
  "lead name":           "first_name",

  "last name":           "last_name",
  "lastname":            "last_name",
  "last_name":           "last_name",
  "surname":             "last_name",
  "family name":         "last_name",

  // Phone variations
  "mobile":              "phone",
  "mobile no":           "phone",
  "mobile no.":          "phone",
  "mobile number":       "phone",
  "phone":               "phone",
  "phone no":            "phone",
  "phone no.":           "phone",
  "phone number":        "phone",
  "contact":             "phone",
  "contact no":          "phone",
  "contact no.":         "phone",
  "contact number":      "phone",
  "cell":                "phone",
  "cell no":             "phone",
  "whatsapp":            "phone",
  "whatsapp number":     "phone",

  // Email variations
  "email":               "email",
  "email id":            "email",
  "email address":       "email",
  "e-mail":              "email",
  "e mail":              "email",
  "mail":                "email",

  // Company variations
  "company":             "company_name",
  "company name":        "company_name",
  "company_name":        "company_name",
  "organisation":        "company_name",
  "organization":        "company_name",
  "org":                 "company_name",
  "business":            "company_name",
  "business name":       "company_name",
  "firm":                "company_name",
  "firm name":           "company_name",

  // Role/designation variations
  "designation":         "designation",
  "role":                "designation",
  "job title":           "designation",
  "position":            "designation",
  "title":               "designation",
  "profile":             "designation",

  // Location variations
  "city":                "city",
  "town":                "city",
  "location":            "city",
  "district":            "city",

  "state":               "state",
  "province":            "state",

  "pincode":             "pincode",
  "pin code":            "pincode",
  "pin":                 "pincode",
  "zip":                 "pincode",
  "zip code":            "pincode",
  "postal code":         "pincode",

  // Inquiry/notes
  "inquiry":             "inquiry_text",
  "inquiry text":        "inquiry_text",
  "enquiry":             "inquiry_text",
  "message":             "inquiry_text",
  "remarks":             "inquiry_text",
  "notes":               "inquiry_text",
  "note":                "inquiry_text",
  "description":         "inquiry_text",
  "requirements":        "inquiry_text",
  "requirement":         "inquiry_text",
  "comment":             "inquiry_text",
  "comments":            "inquiry_text",

  // Value variations
  "value":               "expected_value",
  "deal value":          "expected_value",
  "expected value":      "expected_value",
  "budget":              "expected_value",
  "amount":              "expected_value",
  "order value":         "expected_value",
  "project value":       "expected_value",
}

/**
 * Maps a raw CSV header to a Lead field name.
 * Returns the mapped field name, or a snake_cased version of the original
 * if no mapping exists (for pass-through / custom fields).
 */
export function mapColumnHeader(rawHeader: string): string {
  const normalised = rawHeader.toLowerCase().trim()
  return COLUMN_MAP[normalised] ?? normalised.replace(/\s+/g, "_")
}

/**
 * Transforms a full row of { rawHeader: value } into { leadField: value }.
 * Merges duplicate mappings: if two columns map to "first_name",
 * the first non-empty value wins.
 */
export function mapRow(
  row: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [header, value] of Object.entries(row)) {
    const mapped = mapColumnHeader(header)
    // Don't overwrite an already-set value with an empty one
    if (!result[mapped] && value?.trim()) {
      result[mapped] = value.trim()
    }
  }

  return result
}
