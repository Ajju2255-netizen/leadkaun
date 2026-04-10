/**
 * CSV column header normalisation map.
 *
 * Usage: called from Papa.parse's transformHeader callback AFTER
 * lowercasing and trimming the header string.
 *
 * The map is intentionally broad — real-world CSV exports from CRMs,
 * Excel sheets, Google Forms, JustDial, IndiaMART and manual exports
 * all use wildly different header names.  Every alias here was added
 * because at least one real CSV used it.
 *
 * Lookup order: exact match in this map → fuzzy fallback in resolveFuzzy()
 */

export const COLUMN_MAP: Record<string, string> = {
  // ── Name ──────────────────────────────────────────────────────────────────
  "name":             "first_name",
  "full name":        "first_name",
  "fullname":         "first_name",
  "full_name":        "first_name",
  "customer name":    "first_name",
  "lead name":        "first_name",
  "contact name":     "first_name",
  "first name":       "first_name",
  "firstname":        "first_name",
  "first_name":       "first_name",
  "fname":            "first_name",
  "given name":       "first_name",
  "last name":        "last_name",
  "lastname":         "last_name",
  "last_name":        "last_name",
  "lname":            "last_name",
  "surname":          "last_name",
  "family name":      "last_name",

  // ── Phone ─────────────────────────────────────────────────────────────────
  "phone":            "phone",
  "phone number":     "phone",
  "phone no":         "phone",
  "phone no.":        "phone",
  "phone_no":         "phone",
  "phone_number":     "phone",
  "phonenumber":      "phone",
  "mobile":           "phone",
  "mobile number":    "phone",
  "mobile no":        "phone",
  "mobile no.":       "phone",
  "mobile_no":        "phone",
  "mobile_number":    "phone",
  "mobilenumber":     "phone",
  "mob":              "phone",
  "mob no":           "phone",
  "mob no.":          "phone",
  "mob.":             "phone",
  "contact":          "phone",
  "contact no":       "phone",
  "contact no.":      "phone",
  "contact number":   "phone",
  "contact_no":       "phone",
  "contact_number":   "phone",
  "contactnumber":    "phone",
  "cell":             "phone",
  "cell number":      "phone",
  "telephone":        "phone",
  "tel":              "phone",
  "tel no":           "phone",
  "tel.":             "phone",
  "whatsapp":         "phone",
  "whatsapp no":      "phone",
  "whatsapp number":  "phone",
  "number":           "phone",

  // ── Email ─────────────────────────────────────────────────────────────────
  "email":            "email",
  "email address":    "email",
  "email id":         "email",
  "email_address":    "email",
  "emailaddress":     "email",
  "e-mail":           "email",
  "e mail":           "email",
  "mail":             "email",

  // ── Company ───────────────────────────────────────────────────────────────
  "company":          "company_name",
  "company name":     "company_name",
  "company_name":     "company_name",
  "companyname":      "company_name",
  "organisation":     "company_name",
  "organization":     "company_name",
  "org":              "company_name",
  "org name":         "company_name",
  "firm":             "company_name",
  "firm name":        "company_name",
  "business":         "company_name",
  "business name":    "company_name",

  // ── Designation ───────────────────────────────────────────────────────────
  "designation":      "designation",
  "role":             "designation",
  "job title":        "designation",
  "job_title":        "designation",
  "jobtitle":         "designation",
  "position":         "designation",
  "title":            "designation",
  "dept":             "designation",
  "department":       "designation",

  // ── Location ──────────────────────────────────────────────────────────────
  "city":             "city",
  "town":             "city",
  "district":         "city",
  "location":         "city",
  "state":            "state",
  "province":         "state",
  "pincode":          "pincode",
  "pin code":         "pincode",
  "pin":              "pincode",
  "zip":              "pincode",
  "zip code":         "pincode",
  "postal code":      "pincode",
  "postal_code":      "pincode",

  // ── Inquiry / notes ───────────────────────────────────────────────────────
  "inquiry":          "inquiry_text",
  "enquiry":          "inquiry_text",
  "inquiry text":     "inquiry_text",
  "enquiry text":     "inquiry_text",
  "message":          "inquiry_text",
  "remarks":          "inquiry_text",
  "remark":           "inquiry_text",
  "notes":            "inquiry_text",
  "note":             "inquiry_text",
  "description":      "inquiry_text",
  "comment":          "inquiry_text",
  "comments":         "inquiry_text",
  "details":          "inquiry_text",
  "requirement":      "inquiry_text",
  "requirements":     "inquiry_text",
  "query":            "inquiry_text",

  // ── Value ─────────────────────────────────────────────────────────────────
  "value":            "expected_value",
  "deal value":       "expected_value",
  "deal_value":       "expected_value",
  "expected value":   "expected_value",
  "expected_value":   "expected_value",
  "expectedvalue":    "expected_value",
  "budget":           "expected_value",
  "deal size":        "expected_value",
  "deal_size":        "expected_value",
  "amount":           "expected_value",
  "order value":      "expected_value",
  "order_value":      "expected_value",

  // ── Import-inference fields ───────────────────────────────────────────────
  "interest level":     "interest_level",
  "interest_level":     "interest_level",
  "interestlevel":      "interest_level",       // camelCase lowercased
  "interest":           "interest_level",
  "intent":             "interest_level",
  "lead interest":      "interest_level",
  "customer interest":  "interest_level",
  "priority":           "interest_level",       // "High/Medium/Low priority" maps naturally

  "last contact":           "last_contact_days",
  "last contact days":      "last_contact_days",
  "last_contact_days":      "last_contact_days",
  "lastcontactdays":        "last_contact_days", // camelCase lowercased
  "days since contact":     "last_contact_days",
  "days_since_contact":     "last_contact_days",
  "last contacted":         "last_contact_days",
  "last contacted days":    "last_contact_days",
  "days since last contact":"last_contact_days",
  "follow up days":         "last_contact_days",
  "follow_up_days":         "last_contact_days",
}

/**
 * Fuzzy fallback for column headers not in the exact map.
 *
 * After the exact map fails, this tries substring matching against
 * known field indicators.  Intentionally conservative — only fires
 * when the header clearly belongs to one category.
 *
 * Returns the internal field name, or undefined if no match.
 */
export function resolveFuzzy(lowercased: string): string | undefined {
  // Phone: any header containing "phone", "mobile", "mob", "cell", "tel", "contact no"
  if (/\bphone\b|\bmobile\b|\b mob\b|\bcell\b|contact\s*no/.test(lowercased)) return "phone"

  // Name (but NOT "company name" — that has its own rule)
  if (/\bname\b/.test(lowercased) && !/company|org|firm|business/.test(lowercased)) return "first_name"

  // Email
  if (/\bemail\b|\be-?mail\b/.test(lowercased)) return "email"

  // Company
  if (/company|organisation|organization|firm/.test(lowercased)) return "company_name"

  // Location
  if (/\bcity\b|\btown\b|\bdistrict\b/.test(lowercased)) return "city"
  if (/\bstate\b|\bprovince\b/.test(lowercased)) return "state"
  if (/\bpin\b|\bzip\b|\bpostal\b/.test(lowercased)) return "pincode"

  // Notes / inquiry
  if (/\bnotes?\b|\bremarks?\b|\bmessage\b|\bdescription\b|\bcomments?\b/.test(lowercased)) return "inquiry_text"

  // Interest
  if (/\binterest\b|\bintent\b|\bpriority\b/.test(lowercased)) return "interest_level"

  return undefined
}

/** Single entry point used by Papa.parse transformHeader */
export function mapHeader(raw: string): string {
  const lower = raw.toLowerCase().trim()
  const exact = COLUMN_MAP[lower]
  if (exact) return exact
  const fuzzy = resolveFuzzy(lower)
  if (fuzzy) return fuzzy
  // Fall back to snake_case of the original (preserve unknown columns)
  return lower.replace(/\s+/g, "_")
}
