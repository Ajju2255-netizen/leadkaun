"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Sparkles, AlertTriangle, X } from "lucide-react"
import { useCurrentUser } from "@/hooks/useCurrentUser"

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
 * Soft-paywall banner. Shows from 80% of the active-lead cap (a "you're growing
 * fast" nudge) and turns into a firm — but non-blocking — notice at 100%. It
 * never locks the workspace; existing leads stay usable and only new-lead
 * creation is blocked server-side. Hidden entirely on unlimited plans.
 */
export function LeadLimitBanner() {
  const { data: session } = useCurrentUser()
  const isAdmin = session?.user.role === "ADMIN"
  const [dismissed, setDismissed] = useState(false)

  const { data: usage } = useQuery({
    queryKey: ["lead-usage"],
    queryFn: fetchUsage,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (!usage || usage.limit == null || !usage.nearLimit) return null
  // The 80% warning is dismissible; the 100% notice is not (new leads are blocked).
  if (dismissed && !usage.isOver) return null

  const num = (n: number) => n.toLocaleString("en-IN")

  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3 flex items-start gap-3 ${
        usage.isOver
          ? "border-red-200 bg-red-50/80"
          : "border-amber-200 bg-amber-50/80"
      }`}
    >
      <div className={`mt-0.5 shrink-0 ${usage.isOver ? "text-red-500" : "text-amber-500"}`}>
        {usage.isOver ? <AlertTriangle className="w-4 h-4" strokeWidth={2.4} /> : <Sparkles className="w-4 h-4" strokeWidth={2.4} />}
      </div>

      <div className="min-w-0 flex-1">
        {usage.isOver ? (
          <>
            <p className="text-[13px] font-semibold text-red-900">
              Your {usage.planName} workspace is full — {num(usage.used)} of {num(usage.limit)} active leads.
            </p>
            <p className="text-[12.5px] text-red-800 mt-0.5">
              Existing leads stay fully available. To add new ones, close or remove some deals — won,
              lost and removed leads free up space — or upgrade for more headroom.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-amber-900">
              🎉 You&apos;re growing fast — {num(usage.used)} of {num(usage.limit)} active leads used.
            </p>
            <p className="text-[12.5px] text-amber-800 mt-0.5">
              Upgrade now to keep adding leads without interruption as your pipeline grows.
            </p>
          </>
        )}

        <div className="mt-2 flex items-center gap-3">
          {isAdmin ? (
            <Link
              href="/settings/billing"
              className={`inline-flex h-8 items-center rounded-lg px-3.5 text-[12.5px] font-semibold text-white transition-colors ${
                usage.isOver ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {usage.isOver ? "Upgrade now" : "Upgrade to Starter"}
            </Link>
          ) : (
            <span className="text-[12px] font-medium text-slate-500">Ask an admin to upgrade your plan.</span>
          )}
          {usage.isOver && (
            <Link href="/leads" className="text-[12.5px] font-medium text-red-700 hover:underline underline-offset-2">
              Manage leads
            </Link>
          )}
        </div>
      </div>

      {!usage.isOver && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
}
