/**
 * Indian phone number normaliser — TAD Appendix C
 *
 * Priority order:
 *   1. Indian mobile (+91, 91, 0-prefix, bare 10-digit starting 6-9) → +91XXXXXXXXXX
 *   2. Any 10-digit Indian number (landline etc.)                    → +91XXXXXXXXXX
 *   3. Any reasonable phone (5–15 digits)                            → digits only
 *   4. Everything else                                               → "" (rejected)
 *
 * This intentionally accepts landlines and non-standard formats so that
 * real-world CSV exports (JustDial, IndiaMART, manual sheets) never fail
 * import solely due to number format.
 */
export function normalisePhone(raw: string): string {
  if (!raw) return ""

  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, "")

  if (!digits) return ""

  let mobile: string

  if (digits.length === 12 && digits.startsWith("91")) {
    // +91XXXXXXXXXX or 91XXXXXXXXXX
    mobile = digits.slice(2)
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // 0XXXXXXXXXX (STD trunk prefix)
    mobile = digits.slice(1)
  } else if (digits.length === 10) {
    // Bare 10-digit (mobile or landline)
    mobile = digits
  } else if (digits.length === 13 && digits.startsWith("091")) {
    // 091XXXXXXXXXX (some exports add leading 0 before country code)
    mobile = digits.slice(3)
  } else if (digits.length >= 5 && digits.length <= 15) {
    // Fallback: international or unusual format — store cleaned digits as-is
    return digits
  } else {
    return ""
  }

  if (mobile.length !== 10) return digits.length >= 5 ? digits : ""

  // Indian mobile prefix (6-9): normalise to canonical E.164
  if (/^[6-9]/.test(mobile)) {
    return `+91${mobile}`
  }

  // Other 10-digit Indian numbers (landlines etc.): still store as +91
  // so deduplication works correctly for the same account
  return `+91${mobile}`
}

/**
 * Returns true if the phone is a likely landline.
 * After normalisation, landlines are stored as +91XXXXXXXXXX like mobiles,
 * but the mobile-start check (6–9) can identify them.
 */
export function isLikelyLandline(raw: string): boolean {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) {
    const local = digits.slice(1)
    if (!/^[6-9]/.test(local)) return true
  }
  return false
}
