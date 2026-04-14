"use client"

import { useState, useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { timeAgo } from "@/lib/format"

interface Lead {
  id:            string
  first_name:    string
  last_name:     string | null
  phone:         string
  grade:         string
  intent_score:  number
  fit_score:     number
  is_junk:       boolean
  company_name:  string | null
  city:          string | null
  expected_value: number | null
  created_at:    string
  stage:         { name: string } | null
  source:        { name: string } | null
}

interface LeadsResponse {
  leads: Lead[]
  total: number
  page:  number
  pages: number
}

async function fetchLeads(params: Record<string, string>): Promise<LeadsResponse> {
  const qs  = new URLSearchParams(params).toString()
  const res = await fetch(`/api/leads?${qs}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch leads")
  return res.json()
}

export default function LeadsPage() {
  const { data: session } = useCurrentUser()
  const queryClient = useQueryClient()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"

  const [search, setSearch] = useState("")
  const [grade, setGrade]   = useState("all")
  const [page, setPage]     = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [regrading, setRegrading] = useState(false)

  async function handleRegrade() {
    setRegrading(true)
    try {
      const res  = await fetch("/api/admin/regrade", { method: "POST", credentials: "include" })
      const data = await res.json()
      await queryClient.invalidateQueries({ queryKey: ["leads"] })
      alert(`Regrade complete — ${data.updated ?? 0} leads updated`)
    } catch {
      alert("Regrade failed. Please try again.")
    } finally {
      setRegrading(false)
    }
  }

  const params: Record<string, string> = { page: String(page) }
  if (search) params.search = search
  if (grade !== "all") params.grade = grade

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey:  ["leads", params],
    queryFn:   () => fetchLeads(params),
    staleTime: 30_000,
  })

  const leads = useMemo(() => data?.leads ?? [], [data])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)),
    )
  }, [leads])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">All Leads</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString()} total` : "Loading…"}
          </p>
        </div>
        {isManager && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegrade}
              disabled={regrading}
            >
              {regrading ? "Regrading…" : "Regrade All"}
            </Button>
            <Link href="/leads/import">
              <Button size="sm">Import CSV</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search name, phone, company…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="max-w-xs"
        />
        <Select value={grade} onValueChange={(v) => { setGrade(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All grades</SelectItem>
            {["A", "B", "C", "D", "E", "F"].map((g) => (
              <SelectItem key={g} value={g}>Grade {g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {isManager && selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline">Assign</Button>
          <Button size="sm" variant="outline">Move Stage</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {isManager && (
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === leads.length && leads.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left font-medium">Lead</th>
              <th className="px-3 py-2 text-left font-medium">Grade</th>
              <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Stage</th>
              <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Source</th>
              <th className="px-3 py-2 text-right font-medium hidden lg:table-cell">Value</th>
              <th className="px-3 py-2 text-left font-medium hidden xl:table-cell">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              [...Array(10)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            )}
            {!isLoading && leads.map((lead) => (
              <tr
                key={lead.id}
                className="hover:bg-muted/30 transition-colors"
              >
                {isManager && (
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded"
                    />
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <Link href={`/leads/${lead.id}`} className="hover:underline font-medium">
                    {lead.first_name} {lead.last_name}
                  </Link>
                  {lead.company_name && (
                    <p className="text-xs text-muted-foreground">{lead.company_name}</p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <GradeBadge grade={lead.grade} size="sm" />
                  {lead.is_junk && (
                    <Badge variant="outline" className="ml-1 text-xs">Junk</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">
                  {lead.stage?.name ?? "—"}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">
                  {lead.source?.name ?? "—"}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell text-right">
                  <RupeeValue amount={lead.expected_value} muted />
                </td>
                <td className="px-3 py-2.5 hidden xl:table-cell text-muted-foreground text-xs">
                  {timeAgo(lead.created_at)}
                </td>
              </tr>
            ))}
            {!isLoading && leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No leads found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm" variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
