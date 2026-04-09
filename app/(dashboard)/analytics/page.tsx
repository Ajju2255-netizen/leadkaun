"use client"

import { useDashboard } from "@/hooks/useDashboard"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPct, formatDuration } from "@/lib/format"
import { useHasRole } from "@/hooks/useCurrentUser"

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const isManager = useHasRole("ADMIN", "MANAGER")
  const { data, isLoading } = useDashboard()

  if (!isManager) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        Analytics is available to Admins and Managers only.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }

  const kpis   = data?.kpis
  const reps   = data?.rep_stats ?? []
  const grades = data?.grade_distribution ?? []
  const sources = data?.source_truth ?? []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total Active Leads" value={kpis?.total_leads ?? 0} />
        <KpiCard label="New (7d)"            value={kpis?.new_last_7d ?? 0} />
        <KpiCard label="SQLs"                value={kpis?.sql_count ?? 0} />
        <KpiCard label="Stale Leads"         value={kpis?.stale_leads ?? 0} />
        <KpiCard label="Callbacks Due"       value={kpis?.callbacks_due ?? 0} />
        <KpiCard label="Overdue Follow-ups"  value={kpis?.overdue_followups ?? 0} />
      </div>

      {/* Insight Cards */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpis.sql_count > 0 && (
            <div className="rounded-lg border-l-4 border-green-500 bg-green-50 px-4 py-3">
              <p className="text-sm font-semibold text-green-800">
                {kpis.sql_count} SQL{kpis.sql_count !== 1 ? "s" : ""} ready to close
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                These leads have crossed both fit and intent thresholds.
              </p>
            </div>
          )}
          {kpis.overdue_followups > 0 && (
            <div className="rounded-lg border-l-4 border-destructive bg-destructive/5 px-4 py-3">
              <p className="text-sm font-semibold text-destructive">
                {kpis.overdue_followups} overdue follow-up{kpis.overdue_followups !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Overdue actions reduce team follow-up score.
              </p>
            </div>
          )}
          {kpis.won_this_month > 0 && (
            <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-800">
                <RupeeValue amount={kpis.pipeline_value} className="text-blue-800 font-bold" /> in pipeline
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                <RupeeValue amount={kpis.won_this_month} className="text-blue-700" /> won this month.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Grade Distribution */}
      {grades.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Grade Distribution</h2>
          <div className="space-y-2">
            {grades.map((g) => (
              <div key={g.grade} className="flex items-center gap-3">
                <GradeBadge grade={g.grade} size="sm" />
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${g.pct}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                  {g.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source Truth Cards */}
      {sources.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Source Performance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map((src) => (
              <div key={src.id} className="rounded-lg border bg-card p-4 space-y-2">
                <p className="text-sm font-semibold">{src.name}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold">{src.total_leads}</p>
                    <p className="text-xs text-muted-foreground">Leads</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-600">{src.sql_count}</p>
                    <p className="text-xs text-muted-foreground">SQLs</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatPct(src.conversion_rate)}</p>
                    <p className="text-xs text-muted-foreground">Won%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rep Performance Table */}
      {reps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Rep Performance</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Rep</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">FU%</th>
                  <th className="px-3 py-2 text-right font-medium hidden md:table-cell">Speed</th>
                  <th className="px-3 py-2 text-right font-medium hidden lg:table-cell">Missed ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reps.map((rep) => (
                  <tr key={rep.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-medium">
                      {rep.first_name} {rep.last_name}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rep.assigned}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={rep.follow_up_pct >= 80 ? "text-green-600" : rep.follow_up_pct >= 60 ? "text-yellow-600" : "text-red-500"}>
                        {formatPct(rep.follow_up_pct)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                      {rep.speed_to_lead != null ? formatDuration(rep.speed_to_lead) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right hidden lg:table-cell">
                      <RupeeValue amount={rep.missed_value} muted />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
