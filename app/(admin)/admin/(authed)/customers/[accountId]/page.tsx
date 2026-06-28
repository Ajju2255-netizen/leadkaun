import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getCompany360 } from "@/lib/admin/metrics"
import { getCompanyTimeline } from "@/lib/admin/timeline"
import { computeAccountHealth } from "@/lib/admin/health"
import { getAccountFlags, FEATURE_KEYS, FEATURE_LABELS } from "@/lib/feature-flags"
import { getAccountSubscription, listPlans } from "@/lib/admin/billing"
import { Timeline } from "../../_components/Timeline"
import { LoginAsButton } from "./LoginAsButton"
import { FlagToggles } from "./FlagToggles"
import { PlanEditor } from "./PlanEditor"

export const dynamic = "force-dynamic"

const BAND_COLOR: Record<string, string> = { healthy: "text-emerald-400", warning: "text-amber-400", critical: "text-rose-400" }
const RISK_COLOR: Record<string, string> = { low: "text-emerald-400", medium: "text-amber-400", high: "text-rose-400" }

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`
const date = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
function ago(d: Date | null): string {
  if (!d) return "never"
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[18px] font-bold text-white tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

export default async function Company360({ params }: { params: { accountId: string } }) {
  const [c, timeline, health, flags, sub, plans] = await Promise.all([
    getCompany360(params.accountId),
    getCompanyTimeline(params.accountId, 40),
    computeAccountHealth(params.accountId),
    getAccountFlags(params.accountId),
    getAccountSubscription(params.accountId),
    listPlans(),
  ])
  if (!c) notFound()

  const flagItems = FEATURE_KEYS.map((k) => ({ key: k, label: FEATURE_LABELS[k], enabled: flags[k] }))
  const planOptions = plans.map((p) => ({ key: p.key, name: p.name, priceRupees: Math.round(p.price_inr / 100) }))
  const currentSub = sub ? { planKey: sub.planKey, status: sub.status, mrrRupees: Math.round(sub.mrrInr / 100) } : null

  return (
    <div className="space-y-7">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-white">
        <ChevronLeft className="w-4 h-4" /> Customers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">{c.account.name}</h1>
          <div className="flex items-center gap-3 flex-wrap text-[12px] text-slate-400 mt-1.5">
            <span>{c.account.industry}</span>
            {(c.account.city || c.account.state) && <span>· {[c.account.city, c.account.state].filter(Boolean).join(", ")}</span>}
            <span>· {c.account.teamSize.toLowerCase()}</span>
            <span>· joined {date(c.account.createdAt)}</span>
            <span>· active {ago(c.lastActiveAt)}</span>
          </div>
        </div>
        <LoginAsButton accountId={c.account.id} />
      </div>

      {/* Top facts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Plan" value={sub ? `${sub.planName}` : "—"} />
        <Stat label="MRR" value={sub && sub.mrrInr > 0 ? inr(Math.round(sub.mrrInr / 100)) : "—"} />
        <Stat label="Owner" value={c.owner?.name || "—"} />
        <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Health</p>
          <p className={`text-[18px] font-bold tabular-nums mt-0.5 ${BAND_COLOR[health.band]}`}>{health.score}<span className="text-[12px] text-slate-500"> / 100</span></p>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${RISK_COLOR[health.churnRisk]}`}>{health.churnRisk} churn risk</p>
        </div>
      </div>

      {/* Usage */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Usage</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Leads" value={c.usage.leads.toLocaleString("en-IN")} />
          <Stat label="Activities" value={c.usage.activities.toLocaleString("en-IN")} />
          <Stat label="Recs used" value={c.usage.recommendationsUsed.toLocaleString("en-IN")} />
          <Stat label="Follow-ups" value={c.usage.followUps.toLocaleString("en-IN")} />
          <Stat label="Won" value={c.usage.won.toLocaleString("en-IN")} />
          <Stat label="Won value" value={inr(c.usage.wonValueInr)} />
        </div>
      </div>

      {/* Team + Workspaces */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Team · {c.team.length}</p>
          <div className="rounded-xl border border-white/10 divide-y divide-white/5">
            {c.team.map((u) => (
              <div key={u.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] text-white truncate">{u.name || u.email}</p>
                  <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">{u.role}</span>
                  {!u.isActive && <span className="text-[10px] text-slate-500">inactive</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Workspaces · {c.workspaces.length}</p>
          <div className="rounded-xl border border-white/10 divide-y divide-white/5">
            {c.workspaces.map((w) => (
              <div key={w.id} className="px-4 py-2.5 flex items-center justify-between">
                <p className="text-[13px] text-white">{w.name} {w.isDefault && <span className="text-[10px] text-amber-400 ml-1">default</span>}</p>
                <span className="text-[12px] text-slate-400 tabular-nums">{w.leadCount.toLocaleString("en-IN")} leads</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Health + Feature flags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Health · <span className={BAND_COLOR[health.band]}>{health.band}</span></p>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-5 py-4">
            {health.reasons.length === 0 ? (
              <p className="text-[13px] text-emerald-400">All health signals look good.</p>
            ) : (
              <ul className="space-y-1.5">
                {health.reasons.map((r) => (
                  <li key={r} className="text-[13px] text-slate-300 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />{r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Feature Flags</p>
          <FlagToggles accountId={c.account.id} items={flagItems} />
        </div>
      </div>

      {/* Timeline */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Timeline</p>
        <div className="rounded-xl border border-white/10 bg-slate-900/40 px-5 py-4">
          <Timeline events={timeline} />
        </div>
      </div>

      {/* Billing — manual plan/MRR editor */}
      <div className="max-w-xl">
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">
          Billing {sub && <span className="text-slate-500 normal-case font-normal">· {sub.status}</span>}
        </p>
        <PlanEditor accountId={c.account.id} plans={planOptions} current={currentSub} />
        <p className="text-[11px] text-slate-600 mt-2">Manual until a payment provider is connected — payments/invoices then appear automatically.</p>
      </div>
    </div>
  )
}
