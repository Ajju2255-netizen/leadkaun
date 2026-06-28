import { redirect } from "next/navigation"
import Link from "next/link"
import { LayoutDashboard, Building2, IndianRupee, LifeBuoy, BarChart3, ServerCog, ShieldCheck } from "lucide-react"
import { getPlatformSession } from "@/lib/auth/platform"

// Gate for the entire authed admin surface. Sibling routes /admin/login and
// /admin/security/mfa are NOT under this group, so they aren't gated here.
export default async function AdminAuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession()
  if (!session) redirect("/admin/login")
  if (!session.mfaEnrolled || !session.mfaElevated) redirect("/admin/security/mfa")

  const nav = [
    { href: "/admin",           label: "Dashboard",         icon: LayoutDashboard },
    { href: "/admin/customers", label: "Customers",         icon: Building2 },
    { href: "/admin/revenue",   label: "Revenue",           icon: IndianRupee },
    { href: "/admin/support",   label: "Support",           icon: LifeBuoy },
    { href: "/admin/analytics", label: "Product Analytics", icon: BarChart3 },
    { href: "/admin/system",    label: "System",            icon: ServerCog },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar — deliberately distinct from the customer product chrome */}
      <aside className="w-60 shrink-0 border-r border-white/10 bg-slate-900/60 backdrop-blur flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-white" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <p className="text-[13px] font-bold tracking-tight">Mission Control</p>
              <p className="text-[10px] text-slate-400">Leadkaun admin</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
              <n.icon className="w-4 h-4 shrink-0" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-[11px] text-slate-400 truncate">{session.email}</p>
          <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mt-0.5">{session.role.replace("_", " ")}</p>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
