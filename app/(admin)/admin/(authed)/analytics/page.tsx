import { getRecentActivity } from "@/lib/admin/timeline"
import { getFeatureUsage } from "@/lib/admin/usage"
import { getAcquisitionFunnel } from "@/lib/admin/funnel"
import { Timeline } from "../_components/Timeline"

export const dynamic = "force-dynamic"

export default async function AnalyticsPage() {
  const [activity, usage, funnel] = await Promise.all([getRecentActivity(80), getFeatureUsage(), getAcquisitionFunnel()])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Product Analytics</h1>
        <p className="text-[13px] text-slate-400 mt-1">Acquisition funnel, feature adoption + live activity across all {usage.total} accounts.</p>
      </div>

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Acquisition Funnel</p>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-4 space-y-2.5">
          {funnel.map((s, i) => {
            const prev = i > 0 ? funnel[i - 1].count : s.count
            const drop = prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : 0
            return (
              <div key={s.label}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-slate-300">{s.label}</span>
                  <span className="text-slate-400 tabular-nums">{s.count} · {s.pct}%{i > 0 && drop > 0 && <span className="text-rose-400/80 ml-2">−{drop}%</span>}</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Feature Adoption</p>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-4 space-y-3">
          {usage.rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-slate-300">{r.label}</span>
                <span className="text-slate-400 tabular-nums">{r.count} · {r.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${r.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400 mb-3">Live Activity Feed</p>
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-4">
          <Timeline events={activity} showAccount />
        </div>
      </div>
    </div>
  )
}
