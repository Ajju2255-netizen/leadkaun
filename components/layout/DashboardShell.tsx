"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Zap,
  Users,
  Columns2,
  CalendarCheck,
  BarChart2,
  AlertTriangle,
  Bell,
  UserCog,
  Target,
  FileText,
  type LucideIcon,
} from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { AuthSession } from "@/lib/auth/session"
import type { UserRole } from "@prisma/client"

type NavItem = {
  href:  string
  label: string
  icon:  LucideIcon
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",          label: "Dashboard",            icon: LayoutDashboard, roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/queue",              label: "Priority Queue",       icon: Zap,             roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/leads",              label: "All Leads",            icon: Users,           roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/pipeline",           label: "Pipeline",             icon: Columns2,        roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/follow-ups",         label: "Follow-ups",           icon: CalendarCheck,   roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/analytics",          label: "Analytics",            icon: BarChart2,       roles: ["ADMIN", "MANAGER"] },
  { href: "/missed",             label: "Missed Opps",          icon: AlertTriangle,   roles: ["ADMIN", "MANAGER"] },
  { href: "/notifications",      label: "Notifications",        icon: Bell,            roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/settings/team",      label: "Team",                 icon: UserCog,         roles: ["ADMIN"] },
  { href: "/settings/icp",       label: "ICP Settings",         icon: Target,          roles: ["ADMIN"] },
  { href: "/settings/templates", label: "Templates",            icon: FileText,        roles: ["ADMIN", "MANAGER"] },
]

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN:   "Admin",
  MANAGER: "Manager",
  REP:     "Rep",
}

export function DashboardShell({
  session,
  children,
}: {
  session: AuthSession
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, account } = session

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((n) => n![0].toUpperCase())
    .join("")
    .slice(0, 2)

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="w-56 flex flex-col shrink-0 bg-sidebar border-r border-sidebar-border">

          {/* Logo */}
          <div className="px-4 py-5 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-white font-semibold tracking-tight text-[15px]">Leadkaun</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            {visibleItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-600 text-white"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* User footer */}
          <div className="px-3 py-4 border-t border-sidebar-border space-y-3">
            <div className="text-[11px] font-medium text-sidebar-foreground/50 uppercase tracking-wider px-1">
              {account.name}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                <span className="text-white text-[11px] font-bold">{initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-white truncate leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] text-sidebar-foreground truncate leading-tight">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[12px] text-sidebar-foreground/60 hover:text-red-400 transition-colors w-full text-left px-1"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 p-6 overflow-auto">{children}</div>
        </main>

      </div>
    </TooltipProvider>
  )
}
