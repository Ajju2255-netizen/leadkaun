"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  User2, Lock, Building2, UserCog, Target, Radio, FileText, ChevronLeft,
} from "lucide-react"
import { useCurrentUser } from "@/hooks/useCurrentUser"

const ALL_TABS = [
  { href: "/settings/profile",   label: "Profile",       icon: User2,    section: "personal", roles: ["ADMIN","MANAGER","REP"] },
  { href: "/settings/security",  label: "Security",      icon: Lock,     section: "personal", roles: ["ADMIN","MANAGER","REP"] },
  { href: "/settings/org",       label: "Organisation",  icon: Building2, section: "workspace", roles: ["ADMIN"] },
  { href: "/settings/team",      label: "Team",          icon: UserCog,  section: "workspace", roles: ["ADMIN"] },
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

  return (
    <div className="flex gap-6 items-start max-w-5xl">

      {/* ── Left sub-nav ──────────────────────────────────────────────────── */}
      <aside className="w-[188px] shrink-0 space-y-5">

        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400
                     hover:text-slate-700 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </Link>

        <div className="space-y-4">
          {/* Personal group */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] px-3 mb-1.5">
              Personal
            </p>
            {personal.map((tab) => {
              const Icon     = tab.icon
              const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/")
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]
                              transition-colors duration-150
                              ${isActive
                                ? "text-slate-900 font-semibold bg-white shadow-sm border border-slate-100"
                                : "text-slate-500 font-medium hover:bg-white/60 hover:text-slate-800"
                              }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-sky-600" : "text-slate-400"}`}
                    strokeWidth={isActive ? 2.5 : 2} />
                  {tab.label}
                </Link>
              )
            })}
          </div>

          {/* Workspace group */}
          {workspace.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] px-3 mb-1.5">
                Workspace
              </p>
              {workspace.map((tab) => {
                const Icon     = tab.icon
                const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/")
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]
                                transition-colors duration-150
                                ${isActive
                                  ? "text-slate-900 font-semibold bg-white shadow-sm border border-slate-100"
                                  : "text-slate-500 font-medium hover:bg-white/60 hover:text-slate-800"
                                }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-sky-600" : "text-slate-400"}`}
                      strokeWidth={isActive ? 2.5 : 2} />
                    {tab.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {children}
      </div>

    </div>
  )
}
