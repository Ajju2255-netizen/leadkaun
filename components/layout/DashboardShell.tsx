"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { AuthSession } from "@/lib/auth/session"
import type { UserRole } from "@prisma/client"

type NavItem = {
  href: string
  label: string
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",          label: "Dashboard",             roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/queue",              label: "Priority Queue",        roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/leads",              label: "All Leads",             roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/pipeline",           label: "Pipeline",              roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/follow-ups",         label: "Follow-ups",            roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/analytics",          label: "Analytics",             roles: ["ADMIN", "MANAGER"] },
  { href: "/missed",             label: "Missed Opportunities",  roles: ["ADMIN", "MANAGER"] },
  { href: "/notifications",      label: "Notifications",         roles: ["ADMIN", "MANAGER", "REP"] },
  { href: "/settings/team",      label: "Team",                  roles: ["ADMIN"] },
  { href: "/settings/icp",       label: "ICP Settings",          roles: ["ADMIN"] },
  { href: "/settings/templates", label: "Templates",             roles: ["ADMIN", "MANAGER"] },
]

export function DashboardShell({
  session,
  children,
}: {
  session: AuthSession
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, account } = session

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar */}
        <aside className="w-60 border-r flex flex-col py-4 px-3 shrink-0">
          <div className="mb-6 px-2">
            <span className="text-xl font-bold tracking-tight">Leadkaun</span>
          </div>

          <nav className="flex flex-col gap-1 flex-1">
            {visibleItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* User info + logout */}
          <div className="px-2 pt-4 border-t space-y-2">
            <div>
              <p className="text-sm font-medium truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors w-full text-left"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
            <span className="text-sm font-medium">{account.name}</span>
            <span className="text-xs text-muted-foreground capitalize">
              {user.role.toLowerCase()}
            </span>
          </header>
          <div className="flex-1 p-6 overflow-auto">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  )
}
