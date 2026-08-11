"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Building2, Layers, Users, Target, Gauge, Sparkles, Radio,
  FileSpreadsheet, LineChart, Rocket, Megaphone, Cpu, AlertTriangle, Plug,
  IndianRupee, Activity, ScrollText, ToggleLeft, ServerCog, LifeBuoy, TrendingUp, Receipt,
} from "lucide-react"

// The sidebar is grouped, not a flat list of 25 links: a section per question
// the admin is asking ("who are my customers?", "is the intelligence working?",
// "what's broken?"). Everything else lives one level inside these pages.
const GROUPS: { title: string | null; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    title: null,
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/business", label: "Business", icon: TrendingUp },
    ],
  },
  {
    title: "Customers",
    items: [
      { href: "/admin/accounts",   label: "Accounts",   icon: Building2 },
      { href: "/admin/workspaces", label: "Workspaces", icon: Layers },
      { href: "/admin/users",      label: "Users",      icon: Users },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/admin/leads",           label: "Leads",           icon: Target },
      { href: "/admin/scoring",         label: "Scoring",         icon: Gauge },
      { href: "/admin/recommendations", label: "Recommendations", icon: Sparkles },
      { href: "/admin/signals",         label: "Signals",         icon: Radio },
    ],
  },
  {
    title: "Intake",
    items: [
      { href: "/admin/intake",           label: "Sessions",  icon: FileSpreadsheet },
      { href: "/admin/intake/analytics", label: "Analytics", icon: LineChart },
    ],
  },
  {
    title: "Growth",
    items: [
      { href: "/admin/growth/activation",  label: "Activation",  icon: Rocket },
      { href: "/admin/growth/acquisition", label: "Acquisition", icon: Megaphone },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/admin/ops/jobs",         label: "Jobs",         icon: Cpu },
      { href: "/admin/ops/errors",       label: "Errors",       icon: AlertTriangle },
      { href: "/admin/ops/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/admin/billing",       label: "Subscriptions", icon: IndianRupee },
      { href: "/admin/billing/payments", label: "Payments",   icon: Receipt },
      { href: "/admin/billing/usage",    label: "Usage",      icon: Activity },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/admin/audit",   label: "Audit Log", icon: ScrollText },
      { href: "/admin/support", label: "Support",   icon: LifeBuoy },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/system/flags", label: "Feature Flags", icon: ToggleLeft },
      { href: "/admin/system",       label: "Health",        icon: ServerCog },
    ],
  },
]

/**
 * The admin host serves CLEAN urls: middleware rewrites admin.leadkaun.com/audit
 * onto the (admin) group's /admin/audit. Both forms resolve, so usePathname()
 * returns "/audit" on a direct visit and "/admin/audit" after clicking a link.
 * Normalise both sides to the clean form before comparing, or the highlight
 * silently depends on how you arrived.
 */
function norm(p: string): string {
  return p.replace(/^\/admin(?=\/|$)/, "") || "/"
}

/**
 * Active when the path IS the href, or is nested under it — except for hrefs
 * that are a prefix of a sibling ("/admin/intake" vs "/admin/intake/analytics",
 * "/admin/system" vs "/admin/system/flags"), where only an exact match or a
 * non-sibling child counts. Otherwise two items light up at once.
 */
function isActive(rawPathname: string, rawHref: string, allHrefs: string[]): boolean {
  const pathname = norm(rawPathname)
  const href = norm(rawHref)
  if (pathname === href) return true
  if (href === "/") return false // Overview matches only itself
  if (!pathname.startsWith(href + "/")) return false
  // A longer sibling href that also matches wins instead.
  return !allHrefs
    .map(norm)
    .some((h) => h !== href && h.startsWith(href + "/") && (pathname === h || pathname.startsWith(h + "/")))
}

export function AdminNav() {
  const pathname = usePathname()
  const allHrefs = GROUPS.flatMap((g) => g.items.map((i) => i.href))

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5">
      {GROUPS.map((g, gi) => (
        <div key={g.title ?? `g${gi}`}>
          {g.title && (
            <p className="px-3 pb-1 pt-1 text-[9.5px] font-black uppercase tracking-[0.12em] text-ink-faint">{g.title}</p>
          )}
          <div className="space-y-0.5">
            {g.items.map((n) => {
              const active = isActive(pathname, n.href, allHrefs)
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-2.5 px-3 py-[5px] rounded-lg text-[12.5px] font-semibold transition-colors ${
                    active
                      ? "bg-sky-100/80 text-sky-700"
                      : "text-ink-soft hover:bg-slate-900/[0.04] hover:text-ink"
                  }`}
                >
                  <n.icon className={`w-[15px] h-[15px] shrink-0 ${active ? "text-sky-500" : "text-ink-muted"}`} strokeWidth={2.2} />
                  {n.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
