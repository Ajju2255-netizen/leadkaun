import { GA4_ID, GA4_LINKER_DOMAINS } from "@/lib/analytics/ga4"

/**
 * GA4 base code. Mounted from app/(auth)/layout.tsx — NOT the root layout.
 *
 * The Meta Pixel next door is forced into the root <head> because Meta's
 * installation detector only scans <head>, which is why it needs a runtime
 * pathname gate to avoid reporting the signed-in product. GA4 has no such
 * detector, and gtag works perfectly well from <body>, so it can simply be
 * scoped to the auth route group instead. That is strictly stronger: the tag
 * never loads on /queue or /leads/<id> at all, so no product URL can leak —
 * not via page_view, and not via GA4 enhanced-measurement events either,
 * which a `send_page_view: false` gate would not have stopped.
 *
 * Everything the funnel needs happens inside this route group: the visitor
 * arrives on /register from leadkaun.com carrying the `_gl` linker parameter,
 * this tag accepts it and stitches the session, and `sign_up` fires here.
 *
 * Written as a plain inline <script> rather than next/script for the same
 * reason as the pixel: `afterInteractive` injects the tag after hydration, so
 * it is absent from the server-rendered HTML and can miss the conversion on a
 * fast form submit.
 */
export function GoogleAnalytics() {
  if (!GA4_ID) return null

  const domains = JSON.stringify(GA4_LINKER_DOMAINS)

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} />
      <script
        id="ga4-init"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA4_ID}', {
  linker: { domains: ${domains}, accept_incoming: true }
});`,
        }}
      />
    </>
  )
}
