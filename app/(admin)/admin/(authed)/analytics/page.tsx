import { getRecentActivity } from "@/lib/admin/timeline"
import { Timeline } from "../_components/Timeline"

export const dynamic = "force-dynamic"

export default async function AnalyticsPage() {
  const activity = await getRecentActivity(80)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Product Analytics</h1>
        <p className="text-[13px] text-slate-400 mt-1">Live activity across all accounts. Acquisition funnel and feature usage arrive in later phases.</p>
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
