"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface DashboardData {
  kpis: {
    total_leads:        number
    new_last_7d:        number
    sql_count:          number
    stale_leads:        number
    callbacks_due:      number
    overdue_followups:  number
    won_this_month:     number
    pipeline_value:     number
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
  A: "bg-green-500", B: "bg-blue-500", C: "bg-yellow-500",
  D: "bg-orange-500", E: "bg-red-500", F: "bg-gray-400",
}

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

  const kpiCards = [
    { label: "Total Leads",         value: kpis?.total_leads,        rupee: false },
    { label: "New (7 days)",        value: kpis?.new_last_7d,        rupee: false },
    { label: "SQLs",                value: kpis?.sql_count,          rupee: false },
    { label: "Pipeline Value",      value: kpis?.pipeline_value,     rupee: true  },
    { label: "Callbacks Due",       value: kpis?.callbacks_due,      rupee: false },
    { label: "Overdue Follow-ups",  value: kpis?.overdue_followups,  rupee: false },
    { label: "Won This Month",      value: kpis?.won_this_month,     rupee: true  },
    { label: "Stale Leads",         value: kpis?.stale_leads,        rupee: false },
  ]

  return (
    <div className="space-y-6">
      {/* ICP not-configured banner */}
      {data && !data.icp_configured && isManager && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-yellow-800 font-medium">
            ICP not configured — leads are scored using industry defaults.
          </span>
          <Link href="/settings/icp">
            <Button size="sm" variant="outline" className="ml-4 shrink-0 border-yellow-400 text-yellow-800">
              Configure ICP
            </Button>
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {session?.user.firstName}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, rupee }) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : rupee ? (
              <p className="text-xl font-bold mt-1">
                <RupeeValue amount={value ?? 0} />
              </p>
            ) : (
              <p className="text-2xl font-bold tabular-nums mt-1">
                {(value ?? 0).toLocaleString("en-IN")}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Grade distribution */}
      {gradeD.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Grade Distribution</h2>
          <div className="flex gap-4 flex-wrap">
            {gradeD.map(({ grade, count, pct }) => (
              <div key={grade} className="flex items-center gap-2">
                <GradeBadge grade={grade} size="sm" />
                <span className="text-sm font-medium tabular-nums">{count}</span>
                <span className="text-xs text-muted-foreground">({pct}%)</span>
              </div>
            ))}
          </div>
          <div className="flex h-3 rounded overflow-hidden gap-px">
            {gradeD.map(({ grade, pct }) => (
              <div
                key={grade}
                className={`${GRADE_COLORS[grade] ?? "bg-muted"} transition-all`}
                style={{ width: `${pct}%` }}
                title={`Grade ${grade}: ${pct}%`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/queue"><Button>Open Queue</Button></Link>
        <Link href="/leads"><Button variant="outline">All Leads</Button></Link>
        {isManager && (
          <Link href="/analytics"><Button variant="outline">Analytics</Button></Link>
        )}
        {(kpis?.overdue_followups ?? 0) > 0 && (
          <Link href="/follow-ups">
            <Button variant="outline" className="border-destructive/40 text-destructive">
              Follow-ups
              <Badge variant="destructive" className="ml-2">{kpis!.overdue_followups}</Badge>
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
