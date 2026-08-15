import { META_PIXEL_ID } from "@/lib/analytics/meta-pixel"

/**
 * Meta Pixel base code, mounted only on the `(auth)` routes.
 *
 * Deliberately a plain inline <script>, NOT next/script.
 *
 * `next/script` with `strategy="afterInteractive"` injects the tag from the
 * client after hydration, so it never appears in the server-rendered HTML.
 * The pixel still worked in a real browser, but Meta's pixel-detection crawler
 * reads the raw HTML response — it found no `fbq('init')` and reported
 * "a pixel wasn't detected on this website". A server-rendered inline script
 * is what the detector (and leadkaun.com, which has always passed) uses.
 *
 * This is a server component: it emits markup only and ships no JS of its own.
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
fbq('track', 'PageView');`,
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
