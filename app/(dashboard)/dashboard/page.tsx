"use client"

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

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-500", B: "bg-blue-500", C: "bg-amber-400",
  D: "bg-orange-500", E: "bg-red-500", F: "bg-slate-300",
}

interface KpiDef {
  label:     string
  key:       keyof DashboardData["kpis"]
  rupee:     boolean
  icon:      LucideIcon
  iconColor: string
  accent:    string
}

const KPI_DEFS: KpiDef[] = [
  { label: "Total Leads",        key: "total_leads",       rupee: false, icon: Users,       iconColor: "text-blue-400",    accent: "border-l-blue-400" },
  { label: "New (7 days)",       key: "new_last_7d",       rupee: false, icon: TrendingUp,  iconColor: "text-emerald-400", accent: "border-l-emerald-400" },
  { label: "SQLs",               key: "sql_count",         rupee: false, icon: Star,        iconColor: "text-indigo-400",  accent: "border-l-indigo-400" },
  { label: "Pipeline Value",     key: "pipeline_value",    rupee: true,  icon: DollarSign,  iconColor: "text-teal-400",    accent: "border-l-teal-400" },
  { label: "Callbacks Due",      key: "callbacks_due",     rupee: false, icon: Phone,       iconColor: "text-orange-400",  accent: "border-l-orange-400" },
  { label: "Overdue Follow-ups", key: "overdue_followups", rupee: false, icon: Clock,       iconColor: "text-red-400",     accent: "border-l-red-400" },
  { label: "Won This Month",     key: "won_this_month",    rupee: true,  icon: Trophy,      iconColor: "text-amber-400",   accent: "border-l-amber-400" },
  { label: "Stale Leads",        key: "stale_leads",       rupee: false, icon: AlertCircle, iconColor: "text-slate-400",   accent: "border-l-slate-300" },
]

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

      {/* ICP banner */}
      {data && !data.icp_configured && isManager && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-800 font-medium">
            ICP not configured — leads are scored using industry defaults.
          </p>
          <Link href="/settings/icp">
            <Button size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100">
              Configure ICP
            </Button>
          </Link>
        </div>
      )}

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Welcome back, {session?.user.firstName}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_DEFS.map(({ label, key, rupee, icon: Icon, iconColor, accent }) => (
          <div key={label} className={`rounded-xl bg-white card-shadow border-l-4 ${accent} p-4`}>
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <Icon className={`w-4 h-4 ${iconColor} shrink-0`} />
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-20 mt-2" />
            ) : rupee ? (
              <p className="text-xl font-bold text-slate-900 mt-2">
                <RupeeValue amount={(kpis?.[key] ?? 0) as number} />
              </p>
            ) : (
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
                {((kpis?.[key] ?? 0) as number).toLocaleString("en-IN")}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Grade distribution */}
      {gradeD.length > 0 && (
        <div className="rounded-xl bg-white card-shadow p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Grade Distribution</h2>
          <div className="flex gap-4 flex-wrap">
            {gradeD.map(({ grade, count, pct }) => (
              <div key={grade} className="flex items-center gap-2">
                <GradeBadge grade={grade} size="sm" />
                <span className="text-sm font-semibold tabular-nums text-slate-800">{count}</span>
                <span className="text-xs text-muted-foreground">({pct}%)</span>
              </div>
            ))}
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px bg-slate-100">
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

      {/* Quick actions */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/queue">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Open Queue</Button>
        </Link>
        <Link href="/leads">
          <Button variant="outline">All Leads</Button>
        </Link>
        {isManager && (
          <Link href="/analytics">
            <Button variant="outline">Analytics</Button>
          </Link>
        )}
        {(kpis?.overdue_followups ?? 0) > 0 && (
          <Link href="/follow-ups">
            <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
              Follow-ups
              <Badge variant="destructive" className="ml-2">{kpis!.overdue_followups}</Badge>
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
