import Link from "next/link"
import { getCustomersList } from "@/lib/admin/metrics"

export const dynamic = "force-dynamic"

function ago(d: Date | null): string {
  if (!d) return "—"
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1d ago"
  if (days < 30) return `${days}d ago`
  return `${Math.round(days / 30)}mo ago`
}
const date = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })

export default async function AdminCustomers() {
  const rows = await getCustomersList()

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Customers</h1>
        <span className="text-[12px] text-slate-400 tabular-nums">{rows.length} companies</span>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-white/[0.02]">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">WS</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">Conv.</th>
              <th className="px-4 py-3">Recs used</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[13px] text-slate-500">No companies yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3">
                  <span className={`block w-2.5 h-2.5 rounded-full ${r.healthBand === "healthy" ? "bg-emerald-400" : r.healthBand === "warning" ? "bg-amber-400" : "bg-rose-400"}`} title={r.healthBand} />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/customers/${r.id}`} className="block">
                    <p className="text-[13px] font-semibold text-white">{r.name}</p>
                    <p className="text-[11px] text-slate-500">{r.industry}</p>
                  </Link>
                </td>
                <td className="px-4 py-3 text-[13px] text-slate-300 tabular-nums">{r.users}</td>
                <td className="px-4 py-3 text-[13px] text-slate-300 tabular-nums">{r.workspaces}</td>
                <td className="px-4 py-3 text-[13px] text-slate-300 tabular-nums">{r.leads.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-[13px] tabular-nums">{r.conversionPct == null ? <span className="text-slate-600">—</span> : <span className="text-emerald-400">{r.conversionPct}%</span>}</td>
                <td className="px-4 py-3 text-[13px] text-slate-300 tabular-nums">{r.recommendationsUsed}</td>
                <td className="px-4 py-3 text-[12px]">
                  {r.planName ? (
                    <span className="text-slate-200">{r.planName}{r.mrrInr ? <span className="text-slate-500"> · ₹{r.mrrInr.toLocaleString("en-IN")}</span> : null}</span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3 text-[12px] text-slate-400">{ago(r.lastActiveAt)}</td>
                <td className="px-4 py-3 text-[12px] text-slate-400">{date(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
