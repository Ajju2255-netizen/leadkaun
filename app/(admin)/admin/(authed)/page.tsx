import Link from "next/link"
import { getPlatformDashboard } from "@/lib/admin/metrics"
import { getRecentActivity } from "@/lib/admin/timeline"
import { getLatestInsights } from "@/lib/admin/insights"
import { Timeline } from "./_components/Timeline"

export const dynamic = "force-dynamic"

const SEV_DOT: Record<string, string> = { info: "bg-sky-400", warn: "bg-amber-400", critical: "bg-rose-400" }

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[28px] font-bold text-white tabular-nums leading-tight mt-1">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function HealthPill({ label, state }: { label: string; state: boolean | null }) {
  const dot = state === true ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" : state === false ? "bg-rose-400" : "bg-slate-600"
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-3.5 py-2.5">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="text-[13px] font-medium text-slate-200">{label}</span>
      {state === null && <span className="ml-auto text-[10px] text-slate-500">no data yet</span>}
    </div>
  )
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`

export default async function AdminDashboard() {
  const [d, activity, insights] = await Promise.all([getPlatformDashboard(), getRecentActivity(20), getLatestInsights()])
  const t = d.totals

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">Mission Control</h1>
        <p className="text-[13px] text-slate-400 mt-1">Is the business healthy? Are customers successful? Is the product healthy?</p>
      </div>

      {/* AI Insights — what should I do today? */}
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-slate-900/40 px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-2.5">Today · what needs attention</p>
        <div className="space-y-1.5">
          {insights.map((i, idx) => {
            const body = (
              <span className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${SEV_DOT[i.severity]}`} />
                <span className="text-[13px] text-slate-200">{i.label}</span>
              </span>
            )
            return i.href
              ? <Link key={idx} href={i.href} className="block hover:opacity-80 transition-opacity">{body}</Link>
              : <div key={idx}>{body}</div>
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Companies" value={t.companies.toLocaleString("en-IN")} />
        <Kpi label="Paying Customers" value={d.billing.payingCustomers == null ? "—" : String(d.billing.payingCustomers)} sub={d.billing.payingCustomers == null ? "with billing" : undefined} />
        <Kpi label="Trials" value={d.billing.trials == null ? "—" : String(d.billing.trials)} sub={d.billing.trials == null ? "with billing" : undefined} />
        <Kpi label="MRR" value={d.billing.mrrInr == null ? "—" : inr(d.billing.mrrInr)} sub={d.billing.mrrInr == null ? "with billing" : undefined} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Today's Signups" value={t.signupsToday.toLocaleString("en-IN")} />
        <Kpi label="Active Today" value={t.activeToday.toLocaleString("en-IN")} sub="companies with activity" />
        <Kpi label="Imports Today" value={t.importsToday.toLocaleString("en-IN")} sub={`${t.leadsImportedToday.toLocaleString("en-IN")} leads`} />
        <Kpi label="Emails Sent" value={d.emailsToday == null ? "—" : d.emailsToday.toLocaleString("en-IN")} sub={d.emailsToday == null ? "instrumenting" : "today"} />
      </div>

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">System Health</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <HealthPill label="API" state={d.health.api} />
          <HealthPill label="Database" state={d.health.db} />
          <HealthPill label="Queue" state={d.health.queue} />
          <HealthPill label="Email" state={d.health.email} />
          <HealthPill label="Workers" state={d.health.workers} />
        </div>
      </div>

      <p className="text-[12px] text-slate-500">
        Total leads across all accounts: <span className="font-semibold text-slate-300 tabular-nums">{t.totalLeads.toLocaleString("en-IN")}</span>
      </p>

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Live Activity</p>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-4">
          <Timeline events={activity} showAccount />
        </div>
      </div>
    </div>
  )
}
