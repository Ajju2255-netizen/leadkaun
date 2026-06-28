"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AlertTriangle, X, RefreshCw, Bell, CheckCheck, ChevronRight,
  Clock, Sparkles,
} from "lucide-react"
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

// ── Per-type styling ──────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotifItem["type"], {
  icon:       React.ReactNode
  label:      string
  pillBg:     string   // gradient for the round icon pill
  pillGlow:   string   // outer glow shadow
  rail:       string   // left accent rail color
  unreadTint: string   // unread-card tint
  ctaLabel:   string
  chipColor:  string   // count chip text/bg
}> = {
  AT_RISK: {
    icon:       <AlertTriangle className="w-4 h-4" strokeWidth={2.5} />,
    label:      "At risk",
    pillBg:     "bg-gradient-to-br from-rose-400 to-rose-500",
    pillGlow:   "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_4px_12px_rgba(244,63,94,0.32)]",
    rail:       "bg-gradient-to-b from-rose-400 to-rose-500",
    unreadTint: "bg-rose-50/40",
    ctaLabel:   "Go to queue",
    chipColor:  "bg-rose-50 text-rose-700 border-rose-200",
  },
  FOLLOW_UP_DUE: {
    icon:       <Clock className="w-4 h-4" strokeWidth={2.5} />,
    label:      "Follow-up",
    pillBg:     "bg-gradient-to-br from-orange-300 to-orange-400",
    pillGlow:   "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_4px_12px_rgba(251,146,60,0.32)]",
    rail:       "bg-gradient-to-b from-orange-300 to-orange-400",
    unreadTint: "bg-orange-50/30",
    ctaLabel:   "Go to follow-ups",
    chipColor:  "bg-orange-50 text-orange-700 border-orange-200",
  },
  MISSED: {
    icon:       <X className="w-4 h-4" strokeWidth={3} />,
    label:      "Missed",
    pillBg:     "bg-gradient-to-br from-slate-400 to-slate-500",
    pillGlow:   "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_4px_12px_rgba(100,116,139,0.30)]",
    rail:       "bg-gradient-to-b from-slate-300 to-slate-400",
    unreadTint: "bg-slate-50/60",
    ctaLabel:   "View missed leads",
    chipColor:  "bg-slate-50 text-slate-700 border-slate-200",
  },
  RECOVERY: {
    icon:       <RefreshCw className="w-4 h-4" strokeWidth={2.5} />,
    label:      "Recovery",
    pillBg:     "bg-gradient-to-br from-emerald-400 to-emerald-500",
    pillGlow:   "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_4px_12px_rgba(16,185,129,0.32)]",
    rail:       "bg-gradient-to-b from-emerald-400 to-emerald-500",
    unreadTint: "bg-emerald-50/30",
    ctaLabel:   "Recover now",
    chipColor:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
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
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

// ── Notification Card ─────────────────────────────────────────────────────────

function NotifCard({ item, onRead, onDismiss }: {
  item:   NotifItem
  onRead: (id: string, url: string | null) => void
  onDismiss: (id: string, reason: string) => void
}) {
  const cfg      = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.MISSED
  const isHigh   = item.priority === "high"
  const isUnread = !item.is_read
  const [dismissOpen, setDismissOpen] = useState(false)

  return (
    <div
      onClick={() => isUnread && onRead(item.id, null)}
      className={`
        relative rounded-2xl transition-all duration-200 overflow-hidden
        ${isUnread ? "cursor-pointer hover:-translate-y-[1px]" : "opacity-70"}
        ${isHigh && isUnread ? "glass-2 " + cfg.unreadTint
          : isUnread        ? "glass-2"
                            : "glass-1"}
        ${isUnread ? "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_18px_rgba(15,23,42,0.08)]" : ""}
      `}
    >
      {isUnread && (
        <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${cfg.rail} shadow-[0_0_6px_currentColor]`} />
      )}

      <div className="px-5 py-4 pl-6">
        {/* Top row: icon pill + label + (high pill) + time */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-white ${cfg.pillBg} ${cfg.pillGlow}`}>
              {cfg.icon}
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{cfg.label}</span>
              {isHigh && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 align-middle">
                  <Sparkles className="w-2 h-2" /> HIGH
                </span>
              )}
              {isUnread && !isHigh && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-sky-500 align-middle" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-slate-400 font-medium">{timeAgo(item.created_at)}</span>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setDismissOpen((o) => !o) }}
                title="Dismiss this alert"
                className="w-5 h-5 flex items-center justify-center rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
              {dismissOpen && (
                <div className="absolute right-0 top-6 z-20 w-40 rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.14)] py-1" onClick={(e) => e.stopPropagation()}>
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Dismiss — why?</p>
                  <button onClick={(e) => { e.stopPropagation(); setDismissOpen(false); onDismiss(item.id, "already_handled") }}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors">Already handled</button>
                  <button onClick={(e) => { e.stopPropagation(); setDismissOpen(false); onDismiss(item.id, "not_relevant") }}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors">Not relevant</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-[14px] font-bold text-slate-900 leading-snug">{item.title}</p>
        <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{item.message}</p>

        {item.lead && (
          <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-white/40">
            <GradeBadge grade={item.lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="sm" />
            <span className="text-[12px] font-semibold text-slate-700 truncate flex-1">
              {item.lead.first_name} {item.lead.last_name}
              {item.lead.company_name && (
                <span className="text-slate-400 font-normal"> · {item.lead.company_name}</span>
              )}
            </span>
            {item.lead.expected_value ? (
              <span className="text-[12px] font-extrabold text-emerald-700 tabular-nums shrink-0 font-mono">
                {formatValue(item.lead.expected_value)}
              </span>
            ) : null}
          </div>
        )}

        {item.action_url && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(item.id, item.action_url) }}
            className={`
              mt-3 w-full flex items-center justify-center gap-1.5 h-9 rounded-full
              text-[12px] font-semibold text-white transition-all duration-150 active:scale-[0.98]
              ${isHigh
                ? "bg-gradient-to-b from-rose-400 to-rose-500 hover:from-rose-500 hover:to-rose-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(244,63,94,0.32)]"
                : "bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]"
              }
            `}
          >
            {cfg.ctaLabel}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = "all" | "unread" | "high"

export default function NotificationsPage() {
  const router      = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey:        ["notifications"],
    queryFn:         fetchNotifications,
    refetchInterval: 60_000,
  })

  const [filter, setFilter] = useState<Filter>("all")

  const items   = useMemo(() => data?.items ?? [], [data?.items])
  const unread  = useMemo(() => items.filter((i) => !i.is_read), [items])
  const highPri = useMemo(() => unread.filter((i) => i.priority === "high"), [unread])

  const counts = useMemo(() => {
    const out = { AT_RISK: 0, FOLLOW_UP_DUE: 0, MISSED: 0, RECOVERY: 0 } as Record<NotifItem["type"], number>
    for (const it of unread) out[it.type] = (out[it.type] || 0) + 1
    return out
  }, [unread])

  const filtered = useMemo(() => {
    if (filter === "unread") return unread
    if (filter === "high")   return items.filter((i) => i.priority === "high")
    return items
  }, [filter, items, unread])

  const groupedUnread = filtered.filter((i) => !i.is_read)
  const groupedRead   = filtered.filter((i) =>  i.is_read)

  async function markDismiss(id: string, reason: string) {
    await fetch(`/api/notifications/${id}/dismiss`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
    queryClient.invalidateQueries({ queryKey: ["notif-count"] })
    toast.success("Alert dismissed")
  }

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
    <div className="max-w-[760px] mx-auto space-y-5 pb-12">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
            <Bell className="w-6 h-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Notifications</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {isLoading
                ? "Loading…"
                : unread.length > 0
                  ? `${unread.length} unread · ${items.length} total · last 7 days`
                  : "You're all caught up · last 7 days"}
            </p>
          </div>
        </div>
        {unread.length > 0 && (
          <button
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full glass-1 text-[12px] font-semibold text-slate-700 hover:text-slate-900 transition-all"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* ── Type-count chips ──────────────────────────────────────────────── */}
      {!isLoading && unread.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(Object.keys(TYPE_CONFIG) as NotifItem["type"][]).map((t) => {
            const cfg = TYPE_CONFIG[t]
            const c = counts[t] ?? 0
            return (
              <div key={t} className="rounded-2xl glass-2 gloss-edge px-4 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-white shrink-0 ${cfg.pillBg} ${cfg.pillGlow}`}>
                  {cfg.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-none">{cfg.label}</p>
                  <p className="text-[18px] font-extrabold text-slate-900 tabular-nums leading-none mt-1.5 font-mono">{c}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── High-priority banner ─────────────────────────────────────────── */}
      {!isLoading && highPri.length > 0 && (
        <div className="rounded-2xl glass-3 gloss-edge p-5 relative overflow-hidden">
          <div
            className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(253,164,175,0.50) 0%, rgba(253,164,175,0) 70%)" }}
          />
          <div className="flex items-center gap-3 relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-400 to-rose-500 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_18px_rgba(244,63,94,0.32)]">
              <AlertTriangle className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div className="flex-1">
              <p className="text-[16px] font-bold text-slate-900">
                {highPri.length} high-priority alert{highPri.length > 1 ? "s" : ""} — act now
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">These leads are at risk of being lost.</p>
            </div>
            <button
              onClick={() => setFilter("high")}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 text-white text-[12px] font-semibold transition-all active:scale-[0.97] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]"
            >
              See high
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Filter pills ─────────────────────────────────────────────────── */}
      {!isLoading && items.length > 0 && (
        <div className="flex items-center gap-2">
          {([
            { k: "all"    as const, label: "All",      count: items.length },
            { k: "unread" as const, label: "Unread",   count: unread.length },
            { k: "high"   as const, label: "High",     count: items.filter(i => i.priority === "high").length },
          ]).map(({ k, label, count }) => {
            const active = filter === k
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold transition-all
                  ${active
                    ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                    : "glass-1 text-slate-600 hover:text-slate-900"
                  }`}
              >
                {label}
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${active ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────────────────── */}
      {!isLoading && items.length === 0 && (
        <div className="rounded-2xl glass-3 gloss-edge px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-500 flex items-center justify-center mx-auto mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_18px_rgba(14,165,233,0.32)]">
            <Bell className="w-6 h-6 text-white" strokeWidth={2.4} />
          </div>
          <p className="text-[16px] font-bold text-slate-900">All clear</p>
          <p className="text-[12px] text-slate-500 mt-1.5 max-w-[300px] mx-auto leading-relaxed">
            No alerts right now. Notifications fire when leads go at-risk, follow-ups come due, or Grade A leads are missed.
          </p>
        </div>
      )}

      {/* ── Filter empty ─────────────────────────────────────────────────── */}
      {!isLoading && items.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl glass-2 gloss-edge px-6 py-12 text-center">
          <p className="text-[13px] text-slate-500">Nothing matches this filter.</p>
        </div>
      )}

      {/* ── Unread group ─────────────────────────────────────────────────── */}
      {!isLoading && groupedUnread.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.15)]" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Unread · {groupedUnread.length}</p>
            <div className="flex-1 h-px bg-gradient-to-r from-sky-200/60 to-transparent ml-2" />
          </div>
          {groupedUnread.map((item) => (
            <NotifCard key={item.id} item={item} onRead={markRead} onDismiss={markDismiss} />
          ))}
        </div>
      )}

      {/* ── Read group ───────────────────────────────────────────────────── */}
      {!isLoading && groupedRead.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Earlier · {groupedRead.length}</p>
            <div className="flex-1 h-px bg-gradient-to-r from-slate-200/60 to-transparent ml-2" />
          </div>
          {groupedRead.map((item) => (
            <NotifCard key={item.id} item={item} onRead={markRead} onDismiss={markDismiss} />
          ))}
        </div>
      )}

    </div>
  )
}
