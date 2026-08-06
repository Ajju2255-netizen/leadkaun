"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Sparkles, ArrowRight, Check } from "lucide-react"

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
 * PlanUsageCard — the sidebar-footer plan card. A compact, premium upgrade
 * surface: plan name, active-lead headroom, and (for admins on a capped plan)
 * a clear Upgrade CTA. The gradient shifts by state so shrinking headroom or an
 * exceeded cap reads at a glance. Shares the ["lead-usage"] query with
 * LeadLimitBanner (no extra fetch). Billing is admin-gated; everyone sees usage.
 */
export function PlanUsageCard({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const { data } = useQuery({
    queryKey: ["lead-usage"],
    queryFn: fetchUsage,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (!data) return null

  const unlimited  = data.limit == null
  const canUpgrade = isAdmin && !unlimited
  const num = (n: number) => n.toLocaleString("en-IN")

  // Gradient encodes state: healthy → sky/indigo, near cap → amber, over → red,
  // unlimited → emerald ("you're all set").
  const gradient = unlimited
    ? "from-emerald-500 to-teal-600"
    : data.isOver
      ? "from-rose-500 to-red-600"
      : data.nearLimit
        ? "from-amber-500 to-orange-600"
        : "from-sky-500 to-indigo-600"

  return (
    <div className="mx-3 mb-2">
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-3.5 text-white shadow-[0_8px_20px_-8px_rgba(15,23,42,0.45)]`}>
        {/* top gloss + soft corner glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40" />
        <div className="pointer-events-none absolute -right-7 -top-9 h-24 w-24 rounded-full bg-white/15 blur-xl" />

        {/* plan name */}
        <div className="relative flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-white/95" strokeWidth={2.4} />
          <p className="text-[12.5px] font-bold tracking-tight truncate">{data.planName}</p>
        </div>

        {/* active-lead headroom */}
        {unlimited ? (
          <p className="relative mt-2 flex items-center gap-1.5 text-[11px] font-medium text-white/90">
            <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.6} /> Unlimited active leads
          </p>
        ) : (
          <div className="relative mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(4, data.pct))}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10.5px] font-medium text-white/90">
              {data.isOver
                ? "Lead limit reached"
                : `${num(data.remaining ?? 0)} of ${num(data.limit ?? 0)} leads left`}
            </p>
          </div>
        )}

        {/* upgrade CTA — admins on a capped plan */}
        {canUpgrade && (
          <Link
            href="/settings/billing"
            onClick={onNavigate}
            className="relative mt-3 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white text-[12px] font-bold text-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.14)] transition-all hover:bg-white/95 active:scale-[0.98]"
          >
            {data.isOver ? "Upgrade now" : "Upgrade plan"}
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
          </Link>
        )}
      </div>
    </div>
  )
}
