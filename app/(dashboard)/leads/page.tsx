"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams, useRouter } from "next/navigation"
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

interface NextAction {
  label:    string
  priority: number
  reason:   string
  color:    string
}

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
  next_action:   NextAction
}

interface LeadsResponse {
  leads: Lead[]
  total: number
  page:  number
  pages: number
}

interface ImportBatch {
  id:   string
  name: string | null
  file_name: string | null
  created_at: string
}

async function fetchLeads(params: Record<string, string>): Promise<LeadsResponse> {
  const qs  = new URLSearchParams(params).toString()
  const res = await fetch(`/api/leads?${qs}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch leads")
  return res.json()
}

async function fetchBatches(): Promise<{ jobs: ImportBatch[] }> {
  const res = await fetch("/api/import/history", { credentials: "include" })
  if (!res.ok) return { jobs: [] }
  return res.json()
}

export default function LeadsPage() {
  const { data: session } = useCurrentUser()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"

  // Initialise batch filter from URL ?batch=
  const [search, setSearch] = useState("")
  const [grade, setGrade]   = useState("all")
  const [batch, setBatch]   = useState(searchParams.get("batch") ?? "all")
  const [page, setPage]     = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [regrading, setRegrading] = useState(false)
  const autoRegradeRef = useRef(false)

  // Clear ?batch from URL once we've read it (keeps URL clean on filter changes)
  useEffect(() => {
    if (searchParams.get("batch")) {
      router.replace("/leads", { scroll: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isManager || autoRegradeRef.current) return
    autoRegradeRef.current = true
    fetch("/api/admin/regrade", { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if ((d.updated ?? 0) > 0) {
          queryClient.invalidateQueries({ queryKey: ["leads"] })
        }
      })
      .catch(() => {})
  }, [isManager, queryClient])

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
  if (batch !== "all") params.batch = batch

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey:  ["leads", params],
    queryFn:   () => fetchLeads(params),
    staleTime: 30_000,
  })

  // Only fetch batches for managers
  const { data: batchData } = useQuery<{ jobs: ImportBatch[] }>({
    queryKey:  ["import-history"],
    queryFn:   fetchBatches,
    staleTime: 60_000,
    enabled:   !!isManager,
  })
  const batches = useMemo(() => batchData?.jobs ?? [], [batchData])

  const leads     = useMemo(() => data?.leads ?? [], [data])
  const hotLeads  = useMemo(() => leads.filter((l) => l.grade === "A"), [leads])
  const hotValue  = useMemo(
    () => hotLeads.reduce((sum, l) => sum + (l.expected_value ?? 0), 0),
    [hotLeads],
  )

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

  // Label for active batch filter
  const activeBatchLabel = useMemo(() => {
    if (batch === "all") return null
    const found = batches.find((b) => b.id === batch)
    return found?.name ?? found?.file_name ?? "Import batch"
  }, [batch, batches])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">All Leads</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString()} total` : "Loading…"}
            {activeBatchLabel && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                {activeBatchLabel}
                <button
                  onClick={() => { setBatch("all"); setPage(1) }}
                  className="ml-0.5 hover:text-indigo-900"
                >✕</button>
              </span>
            )}
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

      {/* Priority strip — visible when hot leads exist in current view */}
      {hotLeads.length > 0 && grade === "all" && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg">🔥</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-green-800">
                {hotLeads.length} lead{hotLeads.length > 1 ? "s" : ""} need immediate attention
              </p>
              <p className="text-xs text-green-700 truncate">
                {hotLeads.slice(0, 3).map((l) => `${l.first_name} ${l.last_name ?? ""}`.trim()).join(" · ")}
                {hotLeads.length > 3 && ` +${hotLeads.length - 3} more`}
                {hotValue > 0 && (
                  <span className="ml-1 font-medium">
                    · ₹{hotValue >= 100000
                      ? `${(hotValue / 100000).toFixed(1)}L`
                      : hotValue.toLocaleString("en-IN")} at stake
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setGrade("A")}
            className="shrink-0 text-xs font-medium text-green-700 hover:text-green-900 underline"
          >
            Show only →
          </button>
        </div>
      )}

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
        {isManager && batches.length > 0 && (
          <Select value={batch} onValueChange={(v) => { setBatch(v ?? "all"); setPage(1) }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name ?? b.file_name ?? new Date(b.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
              <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Next Action</th>
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
                  <td colSpan={8} className="px-3 py-3">
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
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${lead.next_action.color}`}
                    title={lead.next_action.reason}
                  >
                    {lead.next_action.label}
                  </span>
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
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
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
