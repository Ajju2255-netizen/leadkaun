"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  Users, TrendingUp, Star, DollarSign,
  Phone, Clock, Trophy, AlertCircle,
  Zap, ArrowRight,
  type LucideIcon,
} from "lucide-react"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useQueue } from "@/hooks/useQueue"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-500", B: "bg-blue-500", C: "bg-amber-400",
  D: "bg-orange-500",  E: "bg-red-500",  F: "bg-slate-300",
}

const CARD_SHADOW = "shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]"

interface KpiDef {
  label: string; key: keyof DashboardData["kpis"]
  rupee: boolean; icon: LucideIcon; iconBg: string; iconColor: string
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

// ── Queue preview strip ───────────────────────────────────────────────────────

function QueuePreview() {
  const { data, isLoading } = useQueue()
  const leads = data?.leads ?? []
  const total = data?.total ?? 0
  const preview = leads.slice(0, 4)

  return (
    <div className={`rounded-xl bg-white ${CARD_SHADOW} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-[13px] font-semibold text-slate-800">Your queue today</span>
            {!isLoading && total > 0 && (
              <span className="ml-2 text-[12px] text-slate-400 tabular-nums">{total} lead{total === 1 ? "" : "s"} to contact</span>
            )}
          </div>
        </div>
        <Link href="/queue">
          <Button size="sm" className="h-7 px-3 text-[12px] bg-indigo-600 hover:bg-indigo-700 text-white gap-1">
            Open Queue <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      {/* Lead rows */}
      {isLoading ? (
        <div className="px-5 py-3 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
        </div>
      ) : preview.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-[13px] font-medium text-slate-600">Queue is clear</p>
          <p className="text-[12px] text-slate-400 mt-0.5">All leads have been actioned. Great work.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {preview.map((lead) => (
            <Link
              key={lead.id}
              href={`/leads/${lead.id}`}
              className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <GradeBadge grade={lead.grade} size="sm" />
              <span className="text-[13px] font-medium text-slate-800 min-w-0 truncate flex-1">
                {lead.first_name} {lead.last_name ?? ""}
              </span>
              {lead.nba && (
                <span className="text-[12px] text-slate-400 truncate max-w-[200px] shrink-0">
                  {lead.nba.action}
                </span>
              )}
            </Link>
          ))}
          {total > 4 && (
            <div className="px-5 py-2.5">
              <Link href="/queue" className="text-[12px] text-indigo-600 hover:underline font-medium">
                + {total - 4} more in queue →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
    <div className="space-y-5 max-w-5xl">

      {/* ── Page heading ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
          Good {greeting()}, {session?.user.firstName}
        </h1>
        <p className="text-[13px] text-slate-400 mt-0.5">Here's where things stand today.</p>
      </div>

      {/* ── Queue preview — always first ──────────────────────────────────── */}
      <QueuePreview />

      {/* ── ICP banner ───────────────────────────────────────────────────── */}
      {data && !data.icp_configured && isManager && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-[13px] text-amber-800 font-medium">
            ICP not configured — leads are scored on industry defaults. Configure it to get accurate grades.
          </p>
          <Link href="/settings/icp">
            <Button size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 text-[12px]">
              Configure ICP
            </Button>
          </Link>
        </div>
      )}

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_DEFS.map(({ label, key, rupee, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className={`rounded-xl bg-white ${CARD_SHADOW} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-none">
                {label}
              </p>
              <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-3.5 h-3.5 ${iconColor}`} strokeWidth={2} />
              </div>
            </div>
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

    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "morning"
  if (h < 17) return "afternoon"
  return "evening"
}
