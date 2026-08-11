import Link from "next/link"
import type { TimelineEvent } from "@/lib/admin/timeline"
import { ago } from "./ui"

const STYLE: Record<string, { dot: string; label: string }> = {
  SIGNUP:               { dot: "bg-emerald-500", label: "Signup" },
  ICP_CONFIGURED:       { dot: "bg-sky-500",     label: "ICP" },
  WORKSPACE_CREATED:    { dot: "bg-cyan-500",    label: "Workspace" },
  WORKSPACE_ARCHIVED:   { dot: "bg-slate-400",   label: "Workspace" },
  USER_INVITED:         { dot: "bg-sky-400",     label: "Invite" },
  USER_JOINED:          { dot: "bg-sky-500",     label: "Joined" },
  USER_DEACTIVATED:     { dot: "bg-slate-400",   label: "User" },
  IMPORT_COMPLETED:     { dot: "bg-cyan-500",    label: "Import" },
  IMPORT_FAILED:        { dot: "bg-red-500",     label: "Import failed" },
  PLAN_CHANGED:         { dot: "bg-violet-500",  label: "Plan" },
  TRIAL_STARTED:        { dot: "bg-orange-400",  label: "Trial" },
  TRIAL_ENDED:          { dot: "bg-orange-500",  label: "Trial" },
  PAYMENT_SUCCEEDED:    { dot: "bg-emerald-500", label: "Payment" },
  PAYMENT_FAILED:       { dot: "bg-red-500",     label: "Payment failed" },
  FEATURE_FLAG_CHANGED: { dot: "bg-violet-500",  label: "Flag" },
  IMPERSONATED:         { dot: "bg-orange-500",  label: "Impersonation" },
}

export function Timeline({ events, showAccount = false }: { events: TimelineEvent[]; showAccount?: boolean }) {
  if (events.length === 0) {
    return <p className="text-[13px] text-ink-muted">No events yet.</p>
  }
  return (
    <ol className="relative border-l border-hairline-strong ml-1.5 space-y-3">
      {events.map((e) => {
        const s = STYLE[e.type] ?? { dot: "bg-slate-400", label: e.type }
        return (
          <li key={e.id} className="ml-4">
            <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${s.dot}`} />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12.5px] text-ink-soft min-w-0">
                <span className="text-[9.5px] font-black uppercase tracking-wider text-ink-muted mr-2">{s.label}</span>
                {e.summary}
                {showAccount && e.accountName && (
                  <Link href={`/admin/accounts/${e.accountId}`} className="text-sky-600 hover:text-sky-700 font-semibold ml-1.5">
                    · {e.accountName}
                  </Link>
                )}
              </p>
              <span className="text-[10.5px] text-ink-muted shrink-0 tabular-nums">{ago(e.createdAt)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
