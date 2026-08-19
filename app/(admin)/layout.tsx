import type { Metadata } from "next"

// Route-group layout that exists only to retitle the admin surface. Without it
// every Mission Control tab inherits the root layout's "Leadkaun — Sales
// Behaviour OS", so an admin with the panel and the product both open cannot
// tell the tabs apart. Pages set the `%s` half via their own `metadata`.
//
// noindex is belt-and-braces: the admin host should never be crawled anyway,
// but the pages behind it are cross-tenant and this costs nothing.
export const metadata: Metadata = {
  title: {
    template: "%s · Mission Control",
    default: "Mission Control",
  },
  robots: { index: false, follow: false },
}

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
