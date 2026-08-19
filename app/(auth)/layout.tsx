import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics"

/**
 * Auth route group.
 *
 * The Meta Pixel used to be mounted here to keep it off the signed-in product,
 * but a nested layout renders into <body> and Meta's detector only scans
 * <head>. It now lives in the root layout's <head>, with PageView gated at
 * runtime to these auth routes so the rest of the app still reports nothing.
 *
 * GA4 has no such detector, so it stays here — where the original intent was.
 * Scoping beats gating: the tag never loads on the signed-in product at all,
 * so product URLs cannot leak through enhanced measurement either. The whole
 * organic funnel lands in this group anyway (marketing → /register → sign_up).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleAnalytics />
      {children}
    </>
  )
}
