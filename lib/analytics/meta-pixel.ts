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
 * The live Meta campaign optimises for Completed Registration, so this must be
 * `CompleteRegistration` — a custom name such as `SignUp` is not a standard
 * event and the campaign would never receive it.
 *
 * Safe to call when the pixel has not loaded (ad blocker, pixel disabled):
 * `fbq` is simply absent and this no-ops rather than throwing inside the
 * signup path.
 */
export function trackCompleteRegistration(params?: { orgName?: string }) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return
  try {
    window.fbq("track", "CompleteRegistration", {
      content_name: "Leadkaun trial signup",
      status: true,
      ...(params?.orgName ? { content_category: params.orgName } : {}),
    })
  } catch {
    // Never let analytics break account creation.
  }
}
