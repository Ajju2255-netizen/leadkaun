"use client"

import { useQuery } from "@tanstack/react-query"

export interface DashboardKpis {
  total_leads:      number
  new_last_7d:      number
  sql_count:        number
  stale_leads:      number
  callbacks_due:    number
  overdue_followups: number
  won_this_month:   number
  pipeline_value:   number
}

export interface GradeDistribution {
  grade: string
  count: number
  pct:   number
}

export interface RepStat {
  id:           string
  first_name:   string
  last_name:    string
  assigned:     number
  follow_up_pct: number
  speed_to_lead: number | null
  missed_value:  number
}

export interface SourceTruth {
  id:           string
  name:         string
  total_leads:  number
  sql_count:    number
  won_count:    number
  avg_intent:   number
  conversion_rate: number
}

export interface DashboardData {
  kpis:               DashboardKpis
  grade_distribution: GradeDistribution[]
  rep_stats:          RepStat[]
  source_truth:       SourceTruth[]
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/analytics/dashboard", { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch dashboard")
  return res.json()
}

/**
 * Analytics dashboard hook — 60-second polling interval (TAD 8.5).
 * Manager/Admin only — components should gate on useHasRole before mounting.
 */
export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey:        ["dashboard"],
    queryFn:         fetchDashboard,
    refetchInterval: 60 * 1000,   // 60 seconds
    staleTime:       55 * 1000,
  })
}
