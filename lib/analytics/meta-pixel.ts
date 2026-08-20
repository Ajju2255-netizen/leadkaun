import { isProductionBrowser } from "@/lib/runtime-env"
/**
 * Meta Pixel — conversion tracking for the signup funnel.
 *
 * The ad click lands on leadkaun.com (marketing), but the registration itself
 * completes here on app.leadkaun.com. Meta attributes a conversion by reading
 * the `_fbp` / `_fbc` cookies the pixel set on the first visit; those are
 * written against the root domain, so a pixel on this subdomain — using the
 * SAME pixel ID as marketing — can read them and close the loop.
 *
 * Deliberately scoped to the `(auth)` routes rather than the whole app: the
 * conversion happens there, and the signed-in product does not need a
 * third-party tracker following users around their own CRM data.
 */

/** Same pixel as leadkaun.com — a different ID would not attribute the click. */
export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "1615607493462627"

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean }
    _fbq?: unknown
  }
}

/**
 * Fire the standard `CompleteRegistration` event.
 *
 * Meta's spec for this event is exactly:
 *
 *     fbq('track', 'CompleteRegistration');
 *
 * — and that is all we send. No parameters.
 *
 * `CompleteRegistration` specifically (not `SignUp`, which is not a standard
 * event at all) because the live campaign optimises for Completed
 * Registration; a non-standard name would never reach it.
 *
 * Nothing about the account is passed. An earlier version put the customer's
 * organisation name in `content_category` — wrong field, and it shipped a
 * customer's business identity to Meta for no benefit. The event alone is what
 * the campaign needs; the pixel already matches the conversion to the ad click
 * through the `_fbc` / `_fbp` cookies.
 *
 * Safe to call when the pixel has not loaded (ad blocker, pixel disabled):
 * `fbq` is simply absent and this no-ops rather than throwing inside the
 * signup path.
 */
export function trackCompleteRegistration(eventId?: string) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return
  // The pixel loads on localhost too, so signup tests were writing real
  // conversions into the ad account against leads that never existed.
  if (!isProductionBrowser()) return
  try {
    // The eventID pairs this with the Conversions API copy of the same event so
    // Meta counts one conversion, not two, when both arrive.
    window.fbq("track", "CompleteRegistration", {}, eventId ? { eventID: eventId } : undefined)
  } catch {
    // Never let analytics break account creation.
  }
}

/**
 * Server-side copy of the same conversion, via our own first-party API route.
 *
 * The browser pixel above is blocked for a meaningful share of users (uBlock,
 * Brave, Firefox strict, Safari ITP), and those signups are silently lost.
 * This request goes to app.leadkaun.com, which blockers do not touch, and the
 * server forwards it to Meta. Shares `eventId` with the pixel call so the two
 * deduplicate.
 *
 * Fire-and-forget: a failure here must never affect the signup.
 */
export function sendCompleteRegistrationServerSide(params: { eventId: string; email: string }) {
  if (typeof window === "undefined") return
  if (!isProductionBrowser()) return
  try {
    const body = JSON.stringify({
      eventId: params.eventId,
      email: params.email,
      sourceUrl: window.location.href,
    })
    // keepalive so the request survives the redirect to /onboarding.
    void fetch("/api/analytics/meta-capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Never let analytics break account creation.
  }
}
