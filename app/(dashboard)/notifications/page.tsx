"use client"

import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/format"

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifItem {
  id:         string
  type:       "AT_RISK" | "FOLLOW_UP_DUE" | "MISSED" | "RECOVERY"
  title:      string
  message:    string
  priority:   string
  action_url: string | null
  is_read:    boolean
  created_at: string
  lead?: {
    id:             string
    first_name:     string
    last_name:      string | null
    grade:          string
    expected_value: number | null
    company_name:   string | null
  } | null
}

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: string; label: string; border: string }> = {
  AT_RISK:       { icon: "🚨", label: "At Risk",   border: "border-l-red-500"     },
  FOLLOW_UP_DUE: { icon: "📞", label: "Follow-up", border: "border-l-amber-500"   },
  MISSED:        { icon: "❌", label: "Missed",     border: "border-l-slate-300"   },
  RECOVERY:      { icon: "🔄", label: "Recovery",  border: "border-l-emerald-500" },
}

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-slate-300",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

async function fetchNotifications(): Promise<{ items: NotifItem[] }> {
  const res = await fetch("/api/notifications", { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch notifications")
  return res.json()
}

// ── Notification Card ─────────────────────────────────────────────────────────

function NotifCard({ item, onRead }: { item: NotifItem; onRead: (id: string, url: string | null) => void }) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.MISSED

  return (
    <div
      className={`rounded-xl bg-white border border-l-[3px] shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4 space-y-2.5 transition-opacity ${
        item.is_read ? "opacity-60" : ""
      } ${cfg.border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Priority dot */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.low}`} />
          {/* Type pill */}
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {cfg.icon} {cfg.label}
          </span>
          {!item.is_read && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(item.created_at)}</span>
      </div>

      {/* Content */}
      <div>
        <p className="text-[13px] font-semibold text-slate-800 leading-snug">{item.title}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{item.message}</p>
      </div>

      {/* Lead row */}
      {item.lead && (
        <div className="flex items-center gap-2">
          <GradeBadge grade={item.lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="sm" />
          <span className="text-[12px] text-slate-600 truncate">
            {item.lead.first_name} {item.lead.last_name}
            {item.lead.company_name && ` · ${item.lead.company_name}`}
          </span>
          {item.lead.expected_value ? (
            <span className="text-[12px] font-bold text-emerald-700 tabular-nums ml-auto shrink-0">
              {formatValue(item.lead.expected_value)}
            </span>
          ) : null}
        </div>
      )}

      {/* Action button */}
      {item.action_url && (
        <button
          onClick={() => onRead(item.id, item.action_url)}
          className="w-full flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold py-2 transition-colors"
        >
          {item.type === "AT_RISK"       && "📞 Go to Priority Queue →"}
          {item.type === "FOLLOW_UP_DUE" && "📅 Go to Follow-ups →"}
          {item.type === "MISSED"        && "❌ View Missed Leads →"}
          {item.type === "RECOVERY"      && "🔄 Recover Now →"}
          {!["AT_RISK","FOLLOW_UP_DUE","MISSED","RECOVERY"].includes(item.type) && "View →"}
        </button>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router      = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey:        ["notifications"],
    queryFn:         fetchNotifications,
    refetchInterval: 60_000,
  })

  const items   = data?.items ?? []
  const unread  = items.filter((i) => !i.is_read).length
  const highPri = items.filter((i) => i.priority === "high" && !i.is_read).length

  async function markRead(id: string, url: string | null) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" })
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
    queryClient.invalidateQueries({ queryKey: ["notif-count"] })
    if (url) router.push(url)
  }

  async function markAllRead() {
    const res = await fetch("/api/notifications/read-all", { method: "POST", credentials: "include" })
    if (res.ok) {
      toast.success("All notifications marked as read")
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      queryClient.invalidateQueries({ queryKey: ["notif-count"] })
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Notifications</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {isLoading ? "Loading…" : unread > 0 ? `${unread} unread · ${items.length} total` : `${items.length} notifications`}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-[12px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors shrink-0"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* High priority banner */}
      {!isLoading && highPri > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="text-[18px] mt-0.5">🚨</span>
          <div>
            <p className="text-[14px] font-bold text-red-900">
              {highPri} high-priority alert{highPri > 1 ? "s" : ""} — act now
            </p>
            <p className="text-[12px] text-red-700 opacity-80">
              These leads are at risk of being lost
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[140px] w-full rounded-xl" />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && items.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-100 shadow-sm px-6 py-12 text-center">
          <div className="text-[32px] mb-3">🔔</div>
          <p className="text-[14px] font-semibold text-slate-700">No notifications</p>
          <p className="text-[12px] text-slate-400 mt-1">You&apos;re all caught up.</p>
        </div>
      )}

      {/* Notification cards */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <NotifCard key={item.id} item={item} onRead={markRead} />
          ))}
        </div>
      )}

    </div>
  )
}
