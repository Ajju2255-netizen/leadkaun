/**
 * Indian phone number normaliser — TAD Appendix C
 *
 * Accepts all 9 common formats encountered in Indian CSV exports and
 * converts them to the canonical E.164 form: +91XXXXXXXXXX (12 chars).
 *
 * Supported input formats:
 *   1. +91XXXXXXXXXX          → already canonical
 *   2. 91XXXXXXXXXX           → 12 digits starting with 91
 *   3. 0XXXXXXXXXX            → 11 digits with STD 0 prefix
 *   4. XXXXXXXXXX             → 10 bare digits
 *   5. +91-XXXXX-XXXXX        → with hyphens
 *   6. +91 XXXXX XXXXX        → with spaces
 *   7. (91) XXXXXXXXXX        → with parentheses
 *   8. 91-XXXXXXXXXX          → country code with hyphen, no +
 *   9. XXXXX XXXXX            → 10 digits with a space in the middle
 *
 * Returns "" if the number cannot be resolved to a valid 10-digit mobile.
 *
 * Valid Indian mobile numbers start with 6, 7, 8, or 9.
 */
export function normalisePhone(raw: string): string {
  if (!raw) return ""

  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, "")

  if (!digits) return ""

  let mobile: string

  if (digits.length === 12 && digits.startsWith("91")) {
    // Format 1/2: +91XXXXXXXXXX or 91XXXXXXXXXX
    mobile = digits.slice(2)
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // Format 3: 0XXXXXXXXXX (STD trunk prefix)
    mobile = digits.slice(1)
  } else if (digits.length === 10) {
    // Format 4/5/6/7/8/9: bare 10-digit or formatted variants
    mobile = digits
  } else if (digits.length > 12) {
    // Possible international number — try stripping leading 91
    if (digits.startsWith("91") && digits.length === 12) {
      mobile = digits.slice(2)
    } else {
      return ""  // too long and not recognisable
    }
  } else {
    return ""  // too short
  }

  // Validate: must be exactly 10 digits starting with 6, 7, 8, or 9
  if (mobile.length !== 10 || !/^[6-9]/.test(mobile)) return ""

  return `+91${mobile}`
}

/**
 * Returns true if the phone is a likely landline.
 * Indian landlines are typically 10 digits starting with 0 (after STD),
 * or 8 digits (without STD). After normalisation, landlines often fail
 * the 6-9 prefix check — so this is a secondary heuristic.
 */
export function isLikelyLandline(raw: string): boolean {
  const digits = raw.replace(/\D/g, "")
  // Landlines with STD: 011XXXXXXXX, 080XXXXXXXX etc. — 11 digits starting with 0 + 2-digit STD
  if (digits.length === 11 && digits.startsWith("0")) {
    const local = digits.slice(1)
    // Landline STD codes are 2-4 digits; mobile starts with 6-9
    if (!/^[6-9]/.test(local)) return true
  }
  return false
}
