import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getCompany360 } from "@/lib/admin/metrics"
import { getCompanyTimeline } from "@/lib/admin/timeline"
import { Timeline } from "../../_components/Timeline"
import { LoginAsButton } from "./LoginAsButton"

export const dynamic = "force-dynamic"

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
  const [c, timeline] = await Promise.all([getCompany360(params.accountId), getCompanyTimeline(params.accountId, 40)])
  if (!c) notFound()

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
        <Stat label="Plan" value="—" />
        <Stat label="MRR" value="—" />
        <Stat label="Owner" value={c.owner?.name || "—"} />
        <Stat label="Health" value="—" />
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

      {/* Timeline */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Timeline</p>
        <div className="rounded-xl border border-white/10 bg-slate-900/40 px-5 py-4">
          <Timeline events={timeline} />
        </div>
      </div>

      <p className="text-[11px] text-slate-600">Health score, plan/MRR editor and feature flags arrive in later phases.</p>
    </div>
  )
}
