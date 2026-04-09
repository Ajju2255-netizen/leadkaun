"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { formatRupee } from "@/lib/format"

interface MissedLead {
  id: string
  first_name: string
  last_name: string | null
  company_name: string | null
  grade: string
  expected_value: number | null
  first_contact_at: string | null
  assigned_rep: { id: string; first_name: string; last_name: string } | null
  hours_overdue: number
}

interface RepMissed {
  rep_id: string
  first_name: string
  last_name: string
  missed_count: number
  missed_value: number
}

interface MissedData {
  total_count: number
  total_value: number
  recovered_this_week: number
  leads: MissedLead[]
  by_rep: RepMissed[]
}

async function fetchMissed(): Promise<MissedData> {
  const res = await fetch("/api/analytics/missed")
  if (!res.ok) throw new Error("Failed to fetch missed opportunities")
  return res.json().then((r) => r.data)
}

function hoursLabel(h: number) {
  if (h < 24) return `${Math.round(h)}h overdue`
  return `${Math.round(h / 24)}d overdue`
}

export default function MissedPage() {
  const { data, isLoading } = useQuery<MissedData>({
    queryKey: ["missed-opportunities"],
    queryFn: fetchMissed,
    refetchInterval: 60_000,
  })

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Missed Opportunity Engine</h1>
        <p className="text-muted-foreground mt-1">High-grade leads that haven&apos;t been contacted in time.</p>
      </div>

      {/* Header Metrics */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-xl p-5 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total at Risk</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">
              {formatRupee(data?.total_value ?? 0)}
            </p>
            <p className="text-sm text-muted-foreground">{data?.total_count ?? 0} leads</p>
          </div>
          <div className="border rounded-xl p-5 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Recovered This Week</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight text-green-600">
              {formatRupee(data?.recovered_this_week ?? 0)}
            </p>
          </div>
          <div className="border rounded-xl p-5 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Leads Overdue</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight text-destructive">
              {data?.total_count ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">A &amp; B grade combined</p>
          </div>
        </div>
      )}

      {/* Per-Rep Cards */}
      {!isLoading && (data?.by_rep?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">By Rep</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(data?.by_rep ?? [])
              .sort((a, b) => b.missed_value - a.missed_value)
              .map((rep) => (
                <div key={rep.rep_id} className="border rounded-lg p-4 space-y-1">
                  <p className="font-medium text-sm">
                    {rep.first_name} {rep.last_name}
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-destructive">
                    {formatRupee(rep.missed_value)}
                  </p>
                  <p className="text-xs text-muted-foreground">{rep.missed_count} overdue leads</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Lead List */}
      <div>
        <h2 className="text-base font-semibold mb-3">Overdue Leads</h2>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : (data?.leads?.length ?? 0) === 0 ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            No missed opportunities right now. Keep up the good work!
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Lead</th>
                  <th className="px-4 py-3 text-left font-medium">Grade</th>
                  <th className="px-4 py-3 text-left font-medium">Value</th>
                  <th className="px-4 py-3 text-left font-medium">Overdue</th>
                  <th className="px-4 py-3 text-left font-medium">Assigned To</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.leads ?? [])
                  .sort((a, b) => b.hours_overdue - a.hours_overdue)
                  .map((lead) => (
                    <tr key={lead.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {lead.first_name} {lead.last_name ?? ""}
                        </div>
                        {lead.company_name && (
                          <div className="text-xs text-muted-foreground">{lead.company_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <GradeBadge grade={lead.grade as "A" | "B" | "C" | "D" | "E" | "F"} />
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">
                        {lead.expected_value ? formatRupee(lead.expected_value) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="destructive" className="text-xs">
                          {hoursLabel(lead.hours_overdue)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {lead.assigned_rep
                          ? `${lead.assigned_rep.first_name} ${lead.assigned_rep.last_name}`
                          : "Unassigned"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/leads/${lead.id}`}>
                          <Button size="sm" variant="outline">
                            View Lead
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
