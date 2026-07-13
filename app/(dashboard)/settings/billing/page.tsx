"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { CreditCard, Check, Users, TrendingUp } from "lucide-react"
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout"

type PlanRow = {
  key: string
  name: string
  priceInr: number
  maxSeats: number
  leadLimit: number | null
  sellable: boolean
  tooSmall: boolean
}
type Sub = {
  planKey: string
  planName: string
  status: string
  mrrInr: number
  trialEndsAt: string | null
  provider: string | null
  billingCycle: string | null
  renewsAt: string | null
} | null
type Seats = {
  used: number
  limit: number
  remaining: number
  isFull: boolean
  planKey: string
  planName: string
}
type LeadUsage = {
  used: number
  limit: number | null
  remaining: number | null
  pct: number
  isOver: boolean
  nearLimit: boolean
  planName: string
}

type BillingState = {
  configured: boolean
  subscription: Sub
  seats: Seats
  leadUsage: LeadUsage
  plans: PlanRow[]
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`

const STATUS_COPY: Record<string, { label: string; cls: string }> = {
  trialing: { label: "Trial",     cls: "bg-sky-50 text-sky-700 border-sky-200" },
  active:   { label: "Active",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  past_due: { label: "Past due",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  canceled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600 border-slate-200" },
}

export default function BillingPage() {
  const [state, setState] = useState<BillingState | null>(null)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const openCheckout = useRazorpayCheckout()

  const load = useCallback(async () => {
    const res = await fetch("/api/billing/subscription", { credentials: "include" })
    if (!res.ok) {
      toast.error("Could not load billing details")
      return
    }
    setState(await res.json())
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleSubscribe(plan: PlanRow) {
    if (busyPlan) return
    setBusyPlan(plan.key)
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planKey: plan.key }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? "Could not start checkout")
        return
      }

      await openCheckout({
        keyId: data.keyId,
        subscriptionId: data.subscriptionId,
        planName: data.planName,
        accountName: data.accountName,
        email: data.email,
        onSuccess: async (payload) => {
          const verify = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          })
          if (verify.ok) {
            toast.success(`You're on ${data.planName}.`)
          } else {
            // The webhook is authoritative and still lands — say so rather than
            // implying the payment failed.
            toast.info("Payment received. Activating your plan — this can take a moment.")
          }
          await load()
        },
        onDismiss: () => toast.info("Checkout cancelled. You have not been charged."),
      })
    } catch {
      toast.error("Could not start checkout")
    } finally {
      setBusyPlan(null)
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription at the end of the current billing period?")) return
    const res = await fetch("/api/billing/subscription", { method: "DELETE", credentials: "include" })
    const data = await res.json()
    if (res.ok) {
      toast.success("Cancellation scheduled for the end of this period.")
      await load()
    } else {
      toast.error(data?.error ?? "Could not cancel")
    }
  }

  if (!state) return (
    <div className="space-y-5 max-w-xl">
      <Skeleton className="h-8 w-40 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )

  const sub = state.subscription
  const seats = state.seats
  const leads = state.leadUsage
  const status = sub ? STATUS_COPY[sub.status] ?? STATUS_COPY.trialing : null
  const isPaid = sub?.status === "active" || sub?.status === "past_due"
  const seatsPct = seats.limit > 0 ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0
  const leadsUnlimited = leads.limit == null
  const leadsPct = leads.pct

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <CreditCard className="w-6 h-6 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Billing</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Your plan and payment method.</p>
        </div>
      </div>

      {!state.configured && (
        <div className="glass-card px-5 py-4 border-amber-200 bg-amber-50/60">
          <p className="text-[13px] text-amber-900 font-medium">Payments are not configured.</p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            Set <code className="font-mono">RAZORPAY_KEY_ID</code> and{" "}
            <code className="font-mono">RAZORPAY_KEY_SECRET</code>, then run the plan sync script.
          </p>
        </div>
      )}

      {/* ── Current plan ─────────────────────────────────────────────────── */}
      <div className="glass-card px-5 py-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold text-slate-500">Current plan</p>
            <p className="text-[20px] font-bold text-ink mt-0.5">{sub?.planName ?? "No plan"}</p>
          </div>
          {status && (
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${status.cls}`}>
              {status.label}
            </span>
          )}
        </div>

        {isPaid && sub && (
          <p className="text-[13px] text-slate-600">
            {rupees(sub.mrrInr)} per month.
            {sub.renewsAt && (
              <>
                {" "}Renews{" "}
                {new Date(sub.renewsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
              </>
            )}
          </p>
        )}
        {sub?.status === "trialing" && sub.trialEndsAt && (
          <p className="text-[13px] text-slate-600">
            Trial ends {new Date(sub.trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
        )}
        {sub?.status === "past_due" && (
          <p className="text-[13px] text-amber-700">
            The last renewal did not go through. Update your payment method with your bank, or resubscribe below.
          </p>
        )}

        {isPaid && sub?.provider === "razorpay" && (
          <button
            onClick={handleCancel}
            className="text-[12px] font-medium text-slate-500 hover:text-red-600 transition-colors"
          >
            Cancel subscription
          </button>
        )}
      </div>

      {/* ── Seat usage ───────────────────────────────────────────────────── */}
      <div className="glass-card px-5 py-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-slate-400" strokeWidth={2.2} />
            <p className="text-[12px] font-semibold text-slate-500">Team seats</p>
          </div>
          <p className="text-[13px] font-semibold text-ink tabular-nums">
            {seats.used} <span className="font-medium text-slate-400">of {seats.limit}</span>
          </p>
        </div>

        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              seats.isFull ? "bg-red-500" : seatsPct >= 80 ? "bg-amber-500" : "bg-sky-500"
            }`}
            style={{ width: `${seatsPct}%` }}
          />
        </div>

        <p className="text-[12px] text-slate-500">
          {seats.isFull ? (
            <span className="text-red-600 font-medium">
              All seats are in use. Upgrade or remove a member to invite someone new.
            </span>
          ) : (
            <>
              {seats.remaining} seat{seats.remaining === 1 ? "" : "s"} remaining on {seats.planName}.
            </>
          )}{" "}
          Pending invites hold a seat until accepted or removed.
        </p>
      </div>

      {/* ── Lead usage (this month) ──────────────────────────────────────── */}
      <div className="glass-card px-5 py-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" strokeWidth={2.2} />
            <p className="text-[12px] font-semibold text-slate-500">Active leads</p>
          </div>
          <p className="text-[13px] font-semibold text-ink tabular-nums">
            {leads.used.toLocaleString("en-IN")}{" "}
            <span className="font-medium text-slate-400">
              {leadsUnlimited ? "· unlimited" : `of ${leads.limit!.toLocaleString("en-IN")}`}
            </span>
          </p>
        </div>

        {!leadsUnlimited && (
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                leads.isOver ? "bg-red-500" : leadsPct >= 80 ? "bg-amber-500" : "bg-sky-500"
              }`}
              style={{ width: `${leadsPct}%` }}
            />
          </div>
        )}

        <p className="text-[12px] text-slate-500">
          {leadsUnlimited ? (
            <>Unlimited active leads on {leads.planName}.</>
          ) : leads.isOver ? (
            <span className="text-red-600 font-medium">
              You&apos;ve hit your {leads.planName} limit. Close or remove some leads, or upgrade, to add
              new ones. Existing leads stay fully usable.
            </span>
          ) : (
            <>
              {leads.remaining!.toLocaleString("en-IN")} more active lead{leads.remaining === 1 ? "" : "s"} on{" "}
              {leads.planName}. Won, lost or removed leads free up space.
            </>
          )}
        </p>
      </div>

      {/* ── Plan picker ──────────────────────────────────────────────────── */}
      {!isPaid && (
        <div className="space-y-2.5">
          {state.plans.map((plan) => {
            const disabled =
              !plan.sellable || !state.configured || plan.tooSmall || busyPlan !== null
            return (
              <div key={plan.key} className="glass-card px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-ink">{plan.name}</p>
                  <p className="text-[13px] text-slate-500 mt-0.5">
                    {rupees(plan.priceInr)} / month · {plan.maxSeats} users ·{" "}
                    {plan.leadLimit == null ? "unlimited leads" : `${plan.leadLimit.toLocaleString("en-IN")} leads/mo`}
                  </p>
                  {plan.tooSmall && (
                    <p className="text-[11px] text-red-600 mt-1">
                      Your team has {seats.used} members — too many for this plan.
                    </p>
                  )}
                  {!plan.sellable && state.configured && !plan.tooSmall && (
                    <p className="text-[11px] text-amber-700 mt-1">Not yet available for online payment.</p>
                  )}
                </div>
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={disabled}
                  className="shrink-0 px-4 py-2 rounded-xl bg-sky-500 text-white text-[13px] font-semibold
                    hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                    inline-flex items-center gap-1.5"
                >
                  {busyPlan === plan.key
                    ? "Opening…"
                    : sub?.planKey === plan.key
                      ? <><Check className="w-3.5 h-3.5" /> Resubscribe</>
                      : "Choose plan"}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Payments are processed by Razorpay. Your card details never touch Leadkaun&apos;s servers.
        Monthly renewals are charged automatically until you cancel.
      </p>
    </div>
  )
}
