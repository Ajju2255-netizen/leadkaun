/**
 * GA4 — organic acquisition measurement across the domain boundary.
 *
 * The problem this exists to solve: a visitor finds leadkaun.com in Google,
 * reads a buyer guide, clicks "Start free", and registers on app.leadkaun.com.
 * GA4 was installed on marketing only, so the session ENDED at the domain hop
 * and the signup was invisible to organic reporting. There was no way to ask
 * "how many signups did organic search produce", which is the single number
 * the growth plan is managed against.
 *
 * The fix has two halves and both are required:
 *   1. The SAME measurement property on both hosts (a second property would
 *      start a fresh session and attribute the signup to a referral from
 *      leadkaun.com — the classic self-referral).
 *   2. `linker.domains` listing both hosts, so marketing decorates outbound
 *      links with `_gl` and this side accepts it, carrying the client_id and
 *      original traffic source across.
 *
 * Scoped like the Meta Pixel deliberately: automatic page_view is OFF, and a
 * page_view is sent only on the `(auth)` routes. The conversion happens there,
 * and the signed-in product should not report URLs like /leads/<id> — which
 * carry customer record identifiers — to a third-party analytics vendor.
 */

/** Same property as leadkaun.com. A different ID breaks cross-domain stitching. */
export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "G-YB7279SHGQ"

/** Hosts that share one GA4 session. Must match the marketing-side config. */
export const GA4_LINKER_DOMAINS = ["leadkaun.com", "app.leadkaun.com"]

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

/**
 * Fire the GA4 `sign_up` event.
 *
 * `sign_up` is a GA4 recommended event, so it appears in the standard
 * acquisition and conversion reports without custom configuration — which is
 * what makes "signups by default channel grouping" answerable at all.
 *
 * The paired Meta event is `CompleteRegistration` (see meta-pixel.ts); the two
 * are separate vendors with separate schemas and are intentionally not merged.
 *
 * No account, organisation or email is passed. GA4 forbids sending PII, and
 * the attribution we need is carried by the client_id the linker preserved.
 *
 * Safe to call when gtag is absent (ad blocker, GA disabled): no-ops rather
 * than throwing inside the signup path.
 */
export function trackSignUp(method: string = "email") {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  try {
    window.gtag("event", "sign_up", { method })
  } catch {
    // Never let analytics break account creation.
  }
}
