import { getPlatformDashboard } from "@/lib/admin/metrics"

export const dynamic = "force-dynamic"

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[28px] font-bold text-white tabular-nums leading-tight mt-1">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function HealthPill({ label, state }: { label: string; state: "ok" | "pending" }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-3.5 py-2.5">
      <span className={`w-2.5 h-2.5 rounded-full ${state === "ok" ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" : "bg-slate-600"}`} />
      <span className="text-[13px] font-medium text-slate-200">{label}</span>
      {state === "pending" && <span className="ml-auto text-[10px] text-slate-500">monitoring soon</span>}
    </div>
  )
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`

export default async function AdminDashboard() {
  const d = await getPlatformDashboard()
  const t = d.totals

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">Mission Control</h1>
        <p className="text-[13px] text-slate-400 mt-1">Is the business healthy? Are customers successful? Is the product healthy?</p>
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
          <HealthPill label="API" state="ok" />
          <HealthPill label="Database" state="ok" />
          <HealthPill label="Queue" state="pending" />
          <HealthPill label="Email" state="pending" />
          <HealthPill label="Workers" state="pending" />
        </div>
      </div>

      <p className="text-[12px] text-slate-500">
        Total leads across all accounts: <span className="font-semibold text-slate-300 tabular-nums">{t.totalLeads.toLocaleString("en-IN")}</span>
      </p>
    </div>
  )
}
