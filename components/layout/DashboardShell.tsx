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
import { useQuery } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { AuthSession } from "@/lib/auth/session"
import type { UserRole } from "@prisma/client"

type NavItem = {
  href:    string
  label:   string
  icon:    LucideIcon
  roles:   UserRole[]
  section: "main" | "settings"
}

const NAV_ITEMS: NavItem[] = [
  { href: "/queue",      label: "Priority Queue", icon: Zap,             roles: ["ADMIN","MANAGER","REP"], section: "main" },
  { href: "/dashboard",  label: "Dashboard",     icon: LayoutDashboard, roles: ["ADMIN","MANAGER","REP"], section: "main" },
  { href: "/leads",      label: "All Leads",      icon: Users,           roles: ["ADMIN","MANAGER","REP"], section: "main" },
  { href: "/pipeline",   label: "Pipeline",       icon: Columns2,        roles: ["ADMIN","MANAGER","REP"], section: "main" },
  { href: "/follow-ups", label: "Follow-ups",     icon: CalendarCheck,   roles: ["ADMIN","MANAGER","REP"], section: "main" },
  { href: "/analytics",  label: "Analytics",      icon: BarChart2,       roles: ["ADMIN","MANAGER"],       section: "main" },
  { href: "/missed",     label: "Missed Opps",    icon: AlertTriangle,   roles: ["ADMIN","MANAGER"],       section: "main" },
  { href: "/notifications", label: "Notifications", icon: Bell,          roles: ["ADMIN","MANAGER","REP"], section: "main" },
  { href: "/settings/team",      label: "Team",          icon: UserCog,  roles: ["ADMIN"],                 section: "settings" },
  { href: "/settings/icp",       label: "ICP Settings",  icon: Target,   roles: ["ADMIN"],                 section: "settings" },
  { href: "/settings/templates", label: "Templates",     icon: FileText, roles: ["ADMIN","MANAGER"],       section: "settings" },
]

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Admin", MANAGER: "Manager", REP: "Sales Rep",
}

function useMissedCount(enabled: boolean) {
  const { data } = useQuery({
    queryKey:        ["missed-count"],
    queryFn:         () =>
      fetch("/api/analytics/missed/count", { credentials: "include" })
        .then((r) => r.ok ? r.json().then((d: { data: { count: number } }) => d.data) : { count: 0 }),
    refetchInterval: 60_000,
    staleTime:       55_000,
    enabled,
  })
  return data?.count ?? 0
}

function useNotifCount() {
  const { data } = useQuery({
    queryKey:        ["notif-count"],
    queryFn:         () =>
      fetch("/api/notifications/count", { credentials: "include" })
        .then((r) => r.ok ? r.json().then((d: { data: { count: number } }) => d.data) : { count: 0 }),
    refetchInterval: 60_000,
    staleTime:       55_000,
  })
  return data?.count ?? 0
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

  const isManager   = user.role === "ADMIN" || user.role === "MANAGER"
  const missedCount = useMissedCount(isManager)
  const notifCount  = useNotifCount()

  const visible     = NAV_ITEMS.filter((i) => i.roles.includes(user.role))
  const mainNav     = visible.filter((i) => i.section === "main")
  const settingsNav = visible.filter((i) => i.section === "settings")

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((n) => n![0].toUpperCase())
    .join("")
    .slice(0, 2) || "U"

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  function NavLink({ item }: { item: NavItem }) {
    const isActive      = pathname === item.href || pathname.startsWith(item.href + "/")
    const Icon          = item.icon
    const showMissed    = item.href === "/missed"         && missedCount > 0
    const showNotif     = item.href === "/notifications"  && notifCount  > 0

    return (
      <Link
        href={item.href}
        className={`
          relative flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] font-medium
          transition-colors duration-100 outline-none
          ${isActive
            ? "bg-blue-50 text-blue-700 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-full before:bg-blue-600"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          }
        `}
      >
        <Icon
          className={`w-[15px] h-[15px] shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`}
          strokeWidth={isActive ? 2.5 : 2}
        />
        {item.label}
        {showMissed && (
          <span className="ml-auto inline-flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] px-1">
            {missedCount > 99 ? "99+" : missedCount}
          </span>
        )}
        {showNotif && (
          <span className="ml-auto inline-flex items-center justify-center text-[10px] font-bold bg-blue-500 text-white rounded-full min-w-[18px] h-[18px] px-1">
            {notifCount > 99 ? "99+" : notifCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="w-[220px] flex flex-col shrink-0 bg-white border-r border-slate-100">

          {/* Logo */}
          <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-100 shrink-0">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-semibold text-slate-900 tracking-tight">Leadkaun</span>
          </div>

          {/* Main nav */}
          <nav className="flex-1 px-2 pt-3 pb-2 space-y-0.5 overflow-y-auto">
            {mainNav.map((item) => <NavLink key={item.href} item={item} />)}

            {/* Settings section */}
            {settingsNav.length > 0 && (
              <>
                <div className="pt-3 pb-1 px-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Settings
                  </span>
                </div>
                {settingsNav.map((item) => <NavLink key={item.href} item={item} />)}
              </>
            )}
          </nav>

          {/* User footer */}
          <div className="px-3 py-3 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center gap-2.5">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-indigo-700">{initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-800 truncate leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] text-slate-400 truncate leading-tight">
                  {account.name} · {ROLE_LABEL[user.role]}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[12px] text-slate-400 hover:text-red-500 transition-colors w-full text-left pl-0.5"
            >
              Sign out
            </button>
          </div>

        </aside>

        {/* ── Main content ────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 p-6 md:p-8 overflow-auto">{children}</div>
        </main>

      </div>
    </TooltipProvider>
  )
}
