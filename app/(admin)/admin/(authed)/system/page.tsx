import Link from "next/link"
import { getSystemHealth, getRecentErrors } from "@/lib/admin/system"

export const dynamic = "force-dynamic"

function rel(d: Date | null): string {
  if (!d) return "never"
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}

export default async function SystemPage() {
  const [h, errors] = await Promise.all([getSystemHealth(), getRecentErrors(25)])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">System</h1>
        <p className="text-[13px] text-slate-400 mt-1">Is the product healthy? Infrastructure, jobs, email, errors.</p>
      </div>

      {/* Top health */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Database</p>
          <p className={`text-[15px] font-bold mt-0.5 ${h.dbOk ? "text-emerald-400" : "text-rose-400"}`}>{h.dbOk ? "Healthy" : "Down"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Emails today</p>
          <p className="text-[15px] font-bold text-white mt-0.5 tabular-nums">{h.emailsToday}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Email failures today</p>
          <p className={`text-[15px] font-bold mt-0.5 tabular-nums ${h.emailFailedToday > 0 ? "text-rose-400" : "text-white"}`}>{h.emailFailedToday}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Rate-limit keys</p>
          <p className="text-[15px] font-bold text-white mt-0.5 tabular-nums">{h.rateLimitKeys}</p>
        </div>
      </div>

      {/* Cron health */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Background Jobs</p>
        <div className="rounded-xl border border-white/10 divide-y divide-white/5">
          {h.crons.map((c) => (
            <div key={c.name} className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${c.lastStatus === "failed" ? "bg-rose-400" : c.healthy ? "bg-emerald-400" : "bg-slate-600"}`} />
                <span className="text-[13px] font-medium text-slate-200 font-mono">{c.name}</span>
              </div>
              <span className="text-[11px] text-slate-400">{c.lastRunAt ? `last run ${rel(c.lastRunAt)}` : "no runs yet"}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 mt-2">Heartbeat per run (recorded once via a memoized step). Stale = no run in 48h.</p>
      </div>

      {/* Errors */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Recent Errors</p>
        <div className="rounded-xl border border-white/10 divide-y divide-white/5">
          {errors.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-slate-500">No failed imports or emails. 🎉</p>
          ) : errors.map((e) => (
            <div key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className={`text-[10px] font-bold uppercase tracking-wider mr-2 ${e.kind === "import" ? "text-amber-400" : "text-rose-400"}`}>{e.kind}</span>
                <span className="text-[13px] text-slate-200">{e.summary}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {e.account_id && <Link href={`/admin/customers/${e.account_id}`} className="text-[11px] text-violet-400 hover:text-violet-300">account</Link>}
                <span className="text-[11px] text-slate-500 tabular-nums">{rel(e.at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
