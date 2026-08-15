import { META_PIXEL_ID } from "@/lib/analytics/meta-pixel"

/**
 * Meta Pixel base code. Rendered inside <head> from the root layout.
 *
 * Two hard-won constraints, both discovered by Meta refusing to detect it:
 *
 * 1. It must be a plain inline <script>, not next/script. `afterInteractive`
 *    injects the tag from the client after hydration, so it never reaches the
 *    server-rendered HTML that Meta's detector reads.
 *
 * 2. It must be in <head>. Mounted from a nested (auth) layout it landed in
 *    <body>, and detection failed even though the snippet was present and the
 *    pixel fired correctly in a browser. Meta's own install instructions say
 *    head, and leadkaun.com — which has always passed — has it there.
 *
 * Because <head> lives in the root layout, the snippet is now present on every
 * page of the app. PageView is therefore gated at RUNTIME to the auth routes:
 * the signed-in product should not be reporting URLs like /leads/<id> to Meta.
 * The gate is deliberately written so the literal `fbq('track', 'PageView')`
 * still appears in the served HTML for detectors to find.
 */
export function MetaPixel() {
  if (!META_PIXEL_ID) return null

  return (
    <>
      <script
        id="meta-pixel-init"
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
if (/^\\/(login|register|forgot-password|set-password)(\\/|$)/.test(location.pathname)) {
  fbq('track', 'PageView');
}`,
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}
