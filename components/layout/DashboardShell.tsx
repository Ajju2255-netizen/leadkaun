"use client"

import { useState, useEffect } from "react"
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
  Trophy,
  Activity,
  Bell,
  Upload,
  LogOut,
  Menu,
  X,
  Layers,
  type LucideIcon,
} from "lucide-react"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { useQuery } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { LeadkaunMark } from "@/components/shared/LeadkaunMark"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { AuthSession } from "@/lib/auth/session"
import type { UserRole } from "@prisma/client"

type NavItem = {
  href:  string
  label: string
  icon:  LucideIcon
  roles: UserRole[]
}

type NavGroup = {
  /** Section header. `null` = utility group, rendered without a label. */
  label: string | null
  items: NavItem[]
}

// Ordered by the actual selling workflow, not by feature inventory:
//   Execute (the daily driver) → Leads (the data) → Insights (oversight).
// Login lands on /queue, so the Priority Queue is the home and leads the list.
// Headers auto-hide when a role can't see any item in the group (e.g. a Rep
// sees only "All Leads" under Leads, only "Dashboard" under Insights).
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Execute",
    items: [
      { href: "/queue",      label: "Priority Queue", icon: Zap,           roles: ["ADMIN","MANAGER","REP"] },
      { href: "/follow-ups", label: "Follow-ups",     icon: CalendarCheck, roles: ["ADMIN","MANAGER","REP"] },
      { href: "/pipeline",   label: "Pipeline",       icon: Columns2,      roles: ["ADMIN","MANAGER","REP"] },
    ],
  },
  {
    label: "Leads",
    items: [
      { href: "/leads",        label: "All Leads",    icon: Users,  roles: ["ADMIN","MANAGER","REP"] },
      { href: "/leads/import", label: "Import Leads", icon: Upload, roles: ["ADMIN","MANAGER"]       },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard, roles: ["ADMIN","MANAGER","REP"] },
      { href: "/activity",     label: "Activity",     icon: Activity,        roles: ["ADMIN","MANAGER","REP"] },
      { href: "/analytics",    label: "Analytics",    icon: BarChart2,       roles: ["ADMIN","MANAGER"]       },
      { href: "/rep-tracking", label: "Rep Tracking", icon: Trophy,          roles: ["ADMIN","MANAGER"]       },
      { href: "/missed",       label: "Missed Opps",  icon: AlertTriangle,   roles: ["ADMIN","MANAGER"]       },
    ],
  },
  {
    label: null,
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell, roles: ["ADMIN","MANAGER","REP"] },
    ],
  },
]

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Admin", MANAGER: "Manager", REP: "Sales Rep",
}

// Defensive: API routes use `apiSuccess(payload)` which returns the payload directly,
// not wrapped in `{ data: payload }`. Old code (and some hooks scattered across the
// codebase) assumed a `.data` envelope — handle both shapes so React Query never
// receives undefined.
type CountPayload = { count?: number; data?: { count?: number } }
function unwrapCount(d: CountPayload): { count: number } {
  return { count: d?.data?.count ?? d?.count ?? 0 }
}

function useMissedCount(enabled: boolean) {
  const { data } = useQuery({
    queryKey:        ["missed-count"],
    queryFn:         async () => {
      const r = await fetch("/api/analytics/missed/count", { credentials: "include" })
      if (!r.ok) return { count: 0 }
      return unwrapCount(await r.json())
    },
    refetchInterval: 60_000,
    staleTime:       55_000,
    enabled,
  })
  return data?.count ?? 0
}

function useNotifCount() {
  const { data } = useQuery({
    queryKey:        ["notif-count"],
    queryFn:         async () => {
      const r = await fetch("/api/notifications/count", { credentials: "include" })
      if (!r.ok) return { count: 0 }
      return unwrapCount(await r.json())
    },
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
  const { user } = session

  const isManager   = user.role === "ADMIN" || user.role === "MANAGER"
  const missedCount = useMissedCount(isManager)
  const notifCount  = useNotifCount()

  // Filter each group's items by role, drop now-empty groups, and keep a flat
  // list for active-state resolution + the mobile top-bar title.
  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role)) }))
    .filter((g) => g.items.length > 0)
  const mainNav = visibleGroups.flatMap((g) => g.items)

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

  const [switching, setSwitching] = useState(false)
  async function switchWorkspace(id: string) {
    if (!id || id === session.workspace?.id || switching) return
    setSwitching(true)
    try {
      await fetch("/api/workspaces/switch", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: id }),
      })
      router.refresh()
    } finally {
      setSwitching(false)
    }
  }

  function NavLink({ item }: { item: NavItem }) {
    const matches    = pathname === item.href || pathname.startsWith(item.href + "/")
    // Defer to a more specific nav item that also matches (e.g. /leads/import
    // should light up "Import Leads", not its parent "All Leads").
    const isActive   = matches && !mainNav.some(
      (o) => o.href.length > item.href.length &&
        (pathname === o.href || pathname.startsWith(o.href + "/")),
    )
    const Icon       = item.icon
    const showMissed = item.href === "/missed"        && missedCount > 0
    const showNotif  = item.href === "/notifications" && notifCount  > 0

    return (
      <Link
        href={item.href}
        className={`
          relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px]
          transition-all duration-150 outline-none
          ${isActive
            ? "text-sky-700 font-semibold bg-sky-50/80 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-sky-500 before:shadow-[0_0_8px_rgba(14,165,233,0.45)]"
            : "text-ink-soft font-medium hover:bg-sky-50/40 hover:text-sky-600"
          }
        `}
      >
        <Icon
          className={`w-[15px] h-[15px] shrink-0 ${isActive ? "text-sky-500" : "text-ink-muted"}`}
          strokeWidth={isActive ? 2.5 : 2}
        />
        {item.label}
        {showMissed && (
          <span
            className="ml-auto inline-flex items-center justify-center text-[10px] font-bold text-white rounded-full min-w-[20px] h-[18px] px-1.5"
            style={{
              background: "linear-gradient(180deg, #FDBA74 0%, #FB923C 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 6px rgba(251,146,60,0.40)",
            }}
          >
            {missedCount > 99 ? "99+" : missedCount}
          </span>
        )}
        {showNotif && (
          <span
            className="ml-auto inline-flex items-center justify-center text-[10px] font-bold text-white rounded-full min-w-[20px] h-[18px] px-1.5"
            style={{
              background: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 6px rgba(14,165,233,0.40)",
            }}
          >
            {notifCount > 99 ? "99+" : notifCount}
          </span>
        )}
      </Link>
    )
  }

  // Mobile drawer state — closed by default; route changes auto-close it.
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => { setMobileOpen(false) }, [pathname])
  // Lock body scroll while drawer is open on mobile.
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden"
    else document.body.style.overflow = ""
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  // Onboarding is a focused, gated first-run flow — render it without the
  // dashboard nav chrome so users complete setup instead of bypassing it
  // (audit: onboarding leaked the full sidebar/top-bar). Auth still runs in the
  // (dashboard) layout, so this only strips the visual shell.
  if (pathname.startsWith("/onboarding")) {
    return (
      <TooltipProvider>
        <div className="min-h-screen overflow-y-auto">{children}</div>
      </TooltipProvider>
    )
  }

  function SidebarBody({ onItemClick }: { onItemClick?: () => void }) {
    return (
      <>
        <Link
          href="/dashboard"
          onClick={onItemClick}
          className="flex items-center gap-2.5 px-4 h-14 shrink-0 group"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <LeadkaunMark size={26} gloss className="transition-transform group-hover:scale-[1.06]" />
          <span className="text-[16px] font-semibold text-ink tracking-[-0.025em] leading-none">
            Leadkaun
          </span>
        </Link>

        {/* Workspace switcher — the active lead-intelligence environment */}
        {session.workspace && (
          <div className="px-3 py-2.5 border-b border-hairline">
            <p className="text-[9px] font-semibold text-ink-faint uppercase tracking-[0.12em] mb-1.5 px-1">Workspace</p>
            {session.workspaces.length > 1 ? (
              <ThemedSelect
                value={session.workspace.id}
                onValueChange={switchWorkspace}
                options={session.workspaces.map((w) => ({ value: w.id, label: w.name }))}
                leadingIcon={<Layers className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                disabled={switching}
                aria-label="Switch workspace"
              />
            ) : (
              <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-white border border-hairline-strong">
                <Layers className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span className="text-[13px] font-medium text-ink truncate">{session.workspace.name}</span>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 px-2 pt-3 pb-2 overflow-y-auto" onClick={onItemClick}>
          {visibleGroups.map((group, gi) => (
            <div
              key={group.label ?? "utility"}
              className={
                gi === 0 ? ""
                  : group.label ? "mt-4"
                  : "mt-3 pt-3 border-t border-hairline"   // utility group — set apart
              }
            >
              {group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => <NavLink key={item.href} item={item} />)}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3" style={{ borderTop: "1px solid var(--hairline)" }}>
          <div className="flex items-center gap-2.5">
            <Link href="/settings/profile" onClick={onItemClick} className="flex items-center gap-2.5 min-w-0 flex-1 group">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-[1.05]"
                style={{
                  background: "linear-gradient(180deg, #BAE6FD 0%, #7DD3FC 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 2px 6px rgba(14,165,233,0.22)",
                }}
              >
                <span className="text-[11px] font-bold text-sky-700">{initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-ink truncate leading-tight group-hover:text-sky-600 transition-colors">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[10px] text-ink-muted truncate leading-tight mt-0.5 font-mono uppercase tracking-[0.10em]">
                  {ROLE_LABEL[user.role]}
                </p>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </>
    )
  }

  // Find the active nav item for the mobile top-bar title
  const activeItem = mainNav.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))

  return (
    <TooltipProvider>
      <div className="flex h-screen md:p-3 md:gap-3 overflow-hidden">

        {/* ── Mobile top-bar (hidden md+) ─────────────────────────────────── */}
        {/* !fixed: `.gloss-edge` sets position:relative (for its ::before gloss),
            which otherwise overrides Tailwind's `fixed` and drops this bar into
            normal flow — shoving <main> to the right on mobile (audit: mobile shell). */}
        <div className="md:hidden !fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-3 glass-1 gloss-edge border-b border-white/30">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-ink hover:bg-white/40 active:scale-[0.96] transition-all"
          >
            <Menu className="w-5 h-5" strokeWidth={2.25} />
          </button>
          <div className="flex items-center gap-2">
            <LeadkaunMark size={22} gloss />
            <span className="text-[14px] font-semibold text-ink tracking-[-0.025em]">
              {activeItem?.label ?? "Leadkaun"}
            </span>
          </div>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative w-10 h-10 rounded-xl flex items-center justify-center text-ink hover:bg-white/40 active:scale-[0.96] transition-all"
          >
            <Bell className="w-5 h-5" strokeWidth={2.25} />
            {notifCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold text-white inline-flex items-center justify-center"
                style={{
                  background: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 6px rgba(14,165,233,0.40)",
                }}
              >
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </Link>
        </div>

        {/* ── Desktop sidebar (md+) ───────────────────────────────────────── */}
        <aside className="hidden md:flex w-[224px] flex-col shrink-0 glass-1 gloss-edge rounded-2xl overflow-hidden">
          <SidebarBody />
        </aside>

        {/* ── Mobile drawer (only when open, hidden md+) ───────────────────── */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <button
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
            />
            {/* Drawer */}
            <aside className="relative w-[260px] h-full flex flex-col glass-3 gloss-edge shadow-2xl animate-in slide-in-from-left duration-200">
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close"
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full glass-1 flex items-center justify-center text-ink hover:bg-white/60 transition-all"
              >
                <X className="w-4 h-4" strokeWidth={2.25} />
              </button>
              <SidebarBody onItemClick={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 md:glass-1 md:gloss-edge md:rounded-2xl overflow-hidden pt-14 md:pt-0">
          <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">{children}</div>
        </main>

      </div>
    </TooltipProvider>
  )
}
