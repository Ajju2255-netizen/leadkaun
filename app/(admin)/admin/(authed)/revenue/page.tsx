import { getRevenue } from "@/lib/admin/billing"

export const dynamic = "force-dynamic"

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[24px] font-bold text-white tabular-nums leading-tight mt-1">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function RevenuePage() {
  const r = await getRevenue()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Revenue</h1>
        <p className="text-[13px] text-slate-400 mt-1">Manual plan/MRR today — payments &amp; invoices populate automatically once a provider is connected.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="MRR" value={inr(r.mrrInr)} />
        <Kpi label="ARR" value={inr(r.arrInr)} />
        <Kpi label="Paying" value={String(r.payingCustomers)} sub="active subscriptions" />
        <Kpi label="Trials" value={String(r.trials)} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Trial → Paid" value={r.conversionPct == null ? "—" : `${r.conversionPct}%`} />
        <Kpi label="Churn" value={r.churnPct == null ? "—" : `${r.churnPct}%`} sub={`${r.canceled} canceled`} />
        <Kpi label="CAC" value="—" sub="needs billing data" />
        <Kpi label="LTV" value="—" sub="needs billing data" />
      </div>

      {/* Plan distribution */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Plan Distribution</p>
        <div className="rounded-xl border border-white/10 divide-y divide-white/5">
          {r.planDistribution.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-slate-500">No subscriptions yet — set plans from each Company 360.</p>
          ) : r.planDistribution.map((p) => (
            <div key={p.plan} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-[13px] text-slate-200">{p.plan}</span>
              <span className="text-[13px] text-slate-400 tabular-nums">{p.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Provider-gated sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {["Payments", "Invoices", "Refunds", "Coupons"].map((title) => (
          <div key={title} className="rounded-2xl border border-dashed border-white/15 bg-slate-900/30 px-5 py-6 text-center">
            <p className="text-[13px] font-semibold text-slate-300">{title}</p>
            <p className="text-[12px] text-slate-500 mt-1">Connect a payment provider (Razorpay / Stripe) to populate {title.toLowerCase()}.</p>
          </div>
        ))}
      </div>
    </div>
  )
}
