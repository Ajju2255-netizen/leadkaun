"use client"

/*
 * Dashboard page — command centre overview.
 *
 * Design intent:
 *   KPI cards follow Intercom's metric card pattern: clean white tile,
 *   small icon (muted colour, top-right), large bold number, label above.
 *   No coloured left borders — those add noise; the icon colour is enough
 *   to provide peripheral differentiation without visual clutter.
 *
 *   Grade distribution: Notion database-style chips + a proportional bar
 *   at the bottom. The bar is the visual summary; the chips are the detail.
 *   Both complement each other — neither is redundant.
 *
 *   Information hierarchy: KPIs → Grade distribution → Quick actions.
 *   The eye naturally flows top-to-bottom, big to small.
 */

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  Users, TrendingUp, Star, DollarSign,
  Phone, Clock, Trophy, AlertCircle,
  type LucideIcon,
} from "lucide-react"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface DashboardData {
  kpis: {
    total_leads:       number
    new_last_7d:       number
    sql_count:         number
    stale_leads:       number
    callbacks_due:     number
    overdue_followups: number
    won_this_month:    number
    pipeline_value:    number
  }
  grade_distribution: { grade: string; count: number; pct: number }[]
}

async function fetchDashboard(): Promise<DashboardData & { icp_configured: boolean }> {
  const [dashRes, icpRes] = await Promise.all([
    fetch("/api/analytics/dashboard", { credentials: "include" }),
    fetch("/api/settings/icp",        { credentials: "include" }),
  ])
  const dash = dashRes.ok ? await dashRes.json() : { kpis: {}, grade_distribution: [] }
  const icp  = icpRes.ok  ? await icpRes.json()  : {}
  return {
    ...dash,
    icp_configured: !!(icp.industries?.length || icp.states?.length),
  }
}

/* Proportional bar fill colours — match GradeBadge semantics */
const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-blue-500",
  C: "bg-amber-400",
  D: "bg-orange-500",
  E: "bg-red-500",
  F: "bg-slate-300",
}

interface KpiDef {
  label:     string
  key:       keyof DashboardData["kpis"]
  rupee:     boolean
  icon:      LucideIcon
  iconBg:    string
  iconColor: string
}

const KPI_DEFS: KpiDef[] = [
  { label: "Total Leads",        key: "total_leads",       rupee: false, icon: Users,       iconBg: "bg-blue-50",    iconColor: "text-blue-500"    },
  { label: "New (7 days)",       key: "new_last_7d",       rupee: false, icon: TrendingUp,  iconBg: "bg-emerald-50", iconColor: "text-emerald-500" },
  { label: "SQLs",               key: "sql_count",         rupee: false, icon: Star,        iconBg: "bg-indigo-50",  iconColor: "text-indigo-500"  },
  { label: "Pipeline Value",     key: "pipeline_value",    rupee: true,  icon: DollarSign,  iconBg: "bg-teal-50",    iconColor: "text-teal-500"    },
  { label: "Callbacks Due",      key: "callbacks_due",     rupee: false, icon: Phone,       iconBg: "bg-orange-50",  iconColor: "text-orange-500"  },
  { label: "Overdue Follow-ups", key: "overdue_followups", rupee: false, icon: Clock,       iconBg: "bg-red-50",     iconColor: "text-red-500"     },
  { label: "Won This Month",     key: "won_this_month",    rupee: true,  icon: Trophy,      iconBg: "bg-amber-50",   iconColor: "text-amber-500"   },
  { label: "Stale Leads",        key: "stale_leads",       rupee: false, icon: AlertCircle, iconBg: "bg-slate-100",  iconColor: "text-slate-400"   },
]

const CARD_SHADOW = "shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]"

export default function DashboardPage() {
  const { data: session } = useCurrentUser()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"

  const { data, isLoading } = useQuery({
    queryKey:        ["dashboard"],
    queryFn:         fetchDashboard,
    refetchInterval: 60_000,
  })

  const kpis   = data?.kpis
  const gradeD = data?.grade_distribution ?? []

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── ICP banner ───────────────────────────────────────────────────── */}
      {data && !data.icp_configured && isManager && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-[13px] text-amber-800 font-medium">
            ICP not configured — leads are scored using industry defaults.
          </p>
          <Link href="/settings/icp">
            <Button size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 text-[12px]">
              Configure ICP
            </Button>
          </Link>
        </div>
      )}

      {/* ── Page heading ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          Welcome back, {session?.user.firstName}
        </p>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_DEFS.map(({ label, key, rupee, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className={`rounded-xl bg-white ${CARD_SHADOW} p-4`}>
            {/* Label + icon row */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-none">
                {label}
              </p>
              <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-3.5 h-3.5 ${iconColor}`} strokeWidth={2} />
              </div>
            </div>

            {/* Value */}
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : rupee ? (
              <p className="text-[22px] font-bold text-slate-900 leading-none tabular-nums">
                <RupeeValue amount={(kpis?.[key] ?? 0) as number} />
              </p>
            ) : (
              <p className="text-[28px] font-bold text-slate-900 leading-none tabular-nums">
                {((kpis?.[key] ?? 0) as number).toLocaleString("en-IN")}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── Grade distribution ───────────────────────────────────────────── */}
      {gradeD.length > 0 && (
        <div className={`rounded-xl bg-white ${CARD_SHADOW} p-5 space-y-4`}>
          <h2 className="text-[13px] font-semibold text-slate-700">Grade Distribution</h2>

          <div className="flex gap-4 flex-wrap">
            {gradeD.map(({ grade, count, pct }) => (
              <div key={grade} className="flex items-center gap-2">
                <GradeBadge grade={grade} size="sm" />
                <span className="text-[13px] font-semibold tabular-nums text-slate-800">{count}</span>
                <span className="text-[11px] text-slate-400">{pct}%</span>
              </div>
            ))}
          </div>

          {/* Proportional bar */}
          <div className="flex h-2 rounded-full overflow-hidden gap-px bg-slate-100">
            {gradeD.map(({ grade, pct }) => (
              <div
                key={grade}
                className={`${GRADE_COLORS[grade] ?? "bg-slate-300"} transition-all rounded-sm`}
                style={{ width: `${pct}%` }}
                title={`Grade ${grade}: ${pct}%`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="flex gap-2.5 flex-wrap">
        <Link href="/queue">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] h-9">
            Open Queue
          </Button>
        </Link>
        <Link href="/leads">
          <Button variant="outline" className="text-[13px] h-9">All Leads</Button>
        </Link>
        {isManager && (
          <Link href="/analytics">
            <Button variant="outline" className="text-[13px] h-9">Analytics</Button>
          </Link>
        )}
        {(kpis?.overdue_followups ?? 0) > 0 && (
          <Link href="/follow-ups">
            <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 text-[13px] h-9">
              Follow-ups
              <Badge variant="destructive" className="ml-2 text-[10px]">
                {kpis!.overdue_followups}
              </Badge>
            </Button>
          </Link>
        )}
      </div>

    </div>
  )
}
