import { redirect } from "next/navigation"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { getPlatformSession } from "@/lib/auth/platform"
import { GlobalSearch } from "./_components/GlobalSearch"
import { AdminNav } from "./_components/AdminNav"

// Gate for the entire authed admin surface. Sibling routes /admin/login and
// /admin/security/mfa are NOT under this group, so they aren't gated here.
export default async function AdminAuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession()
  // Server-side redirect() resolves against the route tree, NOT the public URL
  // space — the clean forms ("/login") don't exist there and would 404. Use the
  // internal paths; middleware collapses them back to clean URLs in the browser.
  if (!session) redirect("/admin/login")
  if (!session.mfaEnrolled || !session.mfaElevated) redirect("/admin/security/mfa")

  const readOnly = session.role !== "SUPER_ADMIN"

  return (
    // Coastal Sunrise, same light system as the product. The admin identity is
    // carried by the shield mark + the "internal" chip, not by a different
    // palette — this is Leadkaun looking at itself.
    <div className="min-h-screen flex text-ink">
      <aside className="w-[228px] shrink-0 border-r border-hairline bg-white flex flex-col sticky top-0 h-screen">
        <div className="px-4 py-3 border-b border-hairline">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-[0_4px_12px_rgba(14,165,233,0.28)]">
              <ShieldCheck className="w-[18px] h-[18px] text-white" strokeWidth={2.4} />
            </div>
            <div className="leading-tight min-w-0">
              <p className="text-[13px] font-semibold tracking-[-0.02em] text-ink">Mission Control</p>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-orange-500">Leadkaun internal</p>
            </div>
          </Link>
        </div>

        <AdminNav />

        <div className="px-4 py-2.5 border-t border-hairline">
          <p className="text-[11px] text-ink-soft truncate font-medium">{session.email}</p>
          <p className={`text-[9.5px] font-semibold uppercase tracking-[0.1em] mt-0.5 ${readOnly ? "text-ink-muted" : "text-sky-600"}`}>
            {session.role.replace("_", " ")}
            {readOnly && " · read-only"}
          </p>
        </div>
      </aside>

      {/* Solid surface, not the body's mesh gradient. The product's main column
          is an opaque panel too — leaving the blobs showing through was the last
          thing making the two apps look like different products. */}
      <main className="flex-1 min-w-0 bg-bg-pure">
        <div className="sticky top-0 z-20 border-b border-hairline bg-white px-8 py-2.5">
          <GlobalSearch />
        </div>
        <div className="max-w-[1180px] mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
