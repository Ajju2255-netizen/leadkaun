"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  User2, Lock, Building2, UserCog, Target, Radio, FileText, ChevronLeft, Layers,
  type LucideIcon,
} from "lucide-react"
import { useCurrentUser } from "@/hooks/useCurrentUser"

type Tab = {
  href: string
  label: string
  icon: LucideIcon
  section: "personal" | "workspace"
  roles: string[]
}

const ALL_TABS: Tab[] = [
  { href: "/settings/profile",   label: "Profile",       icon: User2,    section: "personal", roles: ["ADMIN","MANAGER","REP"] },
  { href: "/settings/security",  label: "Security",      icon: Lock,     section: "personal", roles: ["ADMIN","MANAGER","REP"] },
  { href: "/settings/org",       label: "Organisation",  icon: Building2, section: "workspace", roles: ["ADMIN"] },
  { href: "/settings/team",      label: "Team",          icon: UserCog,  section: "workspace", roles: ["ADMIN"] },
  { href: "/settings/workspaces", label: "Workspaces",   icon: Layers,   section: "workspace", roles: ["ADMIN"] },
  { href: "/settings/icp",       label: "ICP Settings",  icon: Target,   section: "workspace", roles: ["ADMIN"] },
  { href: "/settings/sources",   label: "Lead Sources",  icon: Radio,    section: "workspace", roles: ["ADMIN"] },
  { href: "/settings/templates", label: "Templates",     icon: FileText, section: "workspace", roles: ["ADMIN","MANAGER"] },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname()
  const { data: session } = useCurrentUser()
  const role = session?.user.role ?? "REP"

  const tabs = ALL_TABS.filter((t) => t.roles.includes(role))
  const personal   = tabs.filter((t) => t.section === "personal")
  const workspace  = tabs.filter((t) => t.section === "workspace")

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  // Desktop vertical nav item (grouped sidebar)
  function DeskTab({ tab }: { tab: Tab }) {
    const Icon = tab.icon
    const active = isActive(tab.href)
    return (
      <Link
        href={tab.href}
        className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150
          ${active
            ? "text-slate-900 font-semibold bg-white shadow-sm border border-slate-100"
            : "text-slate-500 font-medium hover:bg-white/60 hover:text-slate-800"}`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-sky-600" : "text-slate-400"}`} strokeWidth={active ? 2.5 : 2} />
        {tab.label}
      </Link>
    )
  }

  // Mobile horizontal pill (scroll strip)
  function PillTab({ tab }: { tab: Tab }) {
    const Icon = tab.icon
    const active = isActive(tab.href)
    return (
      <Link
        href={tab.href}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] whitespace-nowrap shrink-0 transition-colors
          ${active
            ? "text-white font-semibold bg-sky-500 shadow-sm"
            : "text-slate-600 font-medium bg-white/70 border border-slate-100 hover:text-slate-900"}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={active ? 2.5 : 2} />
        {tab.label}
      </Link>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-start max-w-5xl">

      {/* ── Mobile sub-nav: horizontal scroll strip (hidden md+) ──────────── */}
      <nav className="md:hidden -mx-1 px-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => <PillTab key={tab.href} tab={tab} />)}
      </nav>

      {/* ── Desktop sub-nav: grouped vertical sidebar (hidden below md) ───── */}
      <aside className="hidden md:block w-[188px] shrink-0 space-y-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Link>

        <div className="space-y-4">
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] px-3 mb-1.5">Personal</p>
            {personal.map((tab) => <DeskTab key={tab.href} tab={tab} />)}
          </div>
          {workspace.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] px-3 mb-1.5">Workspace</p>
              {workspace.map((tab) => <DeskTab key={tab.href} tab={tab} />)}
            </div>
          )}
        </div>
      </aside>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 w-full">
        {children}
      </div>

    </div>
  )
}
