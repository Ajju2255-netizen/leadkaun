import { getRecentActivity } from "@/lib/admin/timeline"
import { getFeatureUsage } from "@/lib/admin/usage"
import { Timeline } from "../_components/Timeline"

export const dynamic = "force-dynamic"

export default async function AnalyticsPage() {
  const [activity, usage] = await Promise.all([getRecentActivity(80), getFeatureUsage()])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Product Analytics</h1>
        <p className="text-[13px] text-slate-400 mt-1">Feature adoption + live activity across all {usage.total} accounts. The acquisition funnel arrives with billing.</p>
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
