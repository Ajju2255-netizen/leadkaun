import Link from "next/link"
import type { TimelineEvent } from "@/lib/admin/timeline"

const STYLE: Record<string, { dot: string; label: string }> = {
  SIGNUP:            { dot: "bg-emerald-400", label: "Signup" },
  ICP_CONFIGURED:    { dot: "bg-violet-400",  label: "ICP" },
  WORKSPACE_CREATED: { dot: "bg-sky-400",     label: "Workspace" },
  WORKSPACE_ARCHIVED:{ dot: "bg-slate-400",   label: "Workspace" },
  USER_INVITED:      { dot: "bg-blue-400",    label: "Invite" },
  USER_JOINED:       { dot: "bg-blue-400",    label: "Joined" },
  USER_DEACTIVATED:  { dot: "bg-slate-400",   label: "User" },
  IMPORT_COMPLETED:  { dot: "bg-cyan-400",    label: "Import" },
  IMPORT_FAILED:     { dot: "bg-rose-400",    label: "Import failed" },
  PLAN_CHANGED:      { dot: "bg-fuchsia-400", label: "Plan" },
  TRIAL_STARTED:     { dot: "bg-amber-400",   label: "Trial" },
  TRIAL_ENDED:       { dot: "bg-amber-400",   label: "Trial" },
  PAYMENT_SUCCEEDED: { dot: "bg-emerald-400", label: "Payment" },
  PAYMENT_FAILED:    { dot: "bg-rose-400",    label: "Payment failed" },
  FEATURE_FLAG_CHANGED: { dot: "bg-indigo-400", label: "Flag" },
  IMPERSONATED:      { dot: "bg-amber-400",   label: "Impersonation" },
}

function rel(d: Date): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function Timeline({ events, showAccount = false }: { events: TimelineEvent[]; showAccount?: boolean }) {
  if (events.length === 0) {
    return <p className="text-[13px] text-slate-500">No events yet.</p>
  }
  return (
    <ol className="relative border-l border-white/10 ml-1.5 space-y-3.5">
      {events.map((e) => {
        const s = STYLE[e.type] ?? { dot: "bg-slate-400", label: e.type }
        return (
          <li key={e.id} className="ml-4">
            <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${s.dot}`} />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] text-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-2">{s.label}</span>
                {e.summary}
                {showAccount && e.accountName && (
                  <Link href={`/admin/customers/${e.accountId}`} className="text-violet-400 hover:text-violet-300 ml-1.5">· {e.accountName}</Link>
                )}
              </p>
              <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">{rel(e.createdAt)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
