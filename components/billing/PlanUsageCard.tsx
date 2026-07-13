"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"

type LeadUsage = {
  used: number
  limit: number | null
  remaining: number | null
  pct: number
  isOver: boolean
  nearLimit: boolean
  planName: string
}

async function fetchUsage(): Promise<LeadUsage | null> {
  const res = await fetch("/api/billing/lead-usage", { credentials: "include" })
  if (!res.ok) return null
  return res.json()
}

/**
 * Compact plan + active-lead-usage card for the sidebar footer (next to the
 * user). Always-visible upgrade path — "N leads left" + an Upgrade link — so
 * customers see headroom shrinking rather than only meeting the 80% banner.
 * Shares the ["lead-usage"] query with LeadLimitBanner, so no extra fetch.
 * Upgrade is admin-only (Billing is admin-gated); everyone sees usage.
 */
export function PlanUsageCard({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const { data } = useQuery({
    queryKey: ["lead-usage"],
    queryFn: fetchUsage,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (!data) return null

  const unlimited = data.limit == null
  const num = (n: number) => n.toLocaleString("en-IN")
  const barColor = data.isOver ? "bg-red-500" : data.pct >= 80 ? "bg-amber-500" : "bg-sky-500"

  return (
    <div className="mx-3 mb-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-ink truncate">{data.planName}</p>
        {isAdmin && !unlimited && (
          <Link
            href="/settings/billing"
            onClick={onNavigate}
            className="shrink-0 inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-sky-600 hover:text-sky-700 transition-colors"
          >
            <Sparkles className="w-3 h-3" strokeWidth={2.4} /> Upgrade
          </Link>
        )}
      </div>

      {unlimited ? (
        <p className="mt-1 text-[10.5px] text-ink-muted">Unlimited active leads</p>
      ) : (
        <>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-[width] duration-500 ${barColor}`} style={{ width: `${data.pct}%` }} />
          </div>
          <p className={`mt-1 text-[10.5px] ${data.isOver ? "font-medium text-red-600" : "text-ink-muted"}`}>
            {data.isOver
              ? "Lead limit reached"
              : `${num(data.remaining ?? 0)} of ${num(data.limit ?? 0)} leads left`}
          </p>
        </>
      )}
    </div>
  )
}
