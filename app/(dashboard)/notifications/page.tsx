"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { RupeeValue } from "@/components/shared/RupeeValue"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { timeAgo } from "@/lib/format"

interface NotificationItem {
  id:          string
  type:        "SQL_CROSSED" | "GRADE_DROP" | "FOLLOW_UP_OVERDUE" | "IMPORT_COMPLETE"
  title:       string
  description: string
  lead_id:     string | null
  lead_name:   string | null
  grade:       string | null
  value:       number | null
  created_at:  string
}

async function fetchNotifications(): Promise<{ items: NotificationItem[] }> {
  const res = await fetch("/api/notifications", { credentials: "include" })
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

const TYPE_STYLES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  SQL_CROSSED:         { label: "SQL",        variant: "default"     },
  GRADE_DROP:          { label: "Grade Drop", variant: "destructive" },
  FOLLOW_UP_OVERDUE:   { label: "Overdue",    variant: "destructive" },
  IMPORT_COMPLETE:     { label: "Import",     variant: "secondary"   },
}

export default function NotificationsPage() {
  const { data, isLoading } = useQuery({
    queryKey:        ["notifications"],
    queryFn:         fetchNotifications,
    refetchInterval: 60_000,
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${items.length} recent alerts`}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-lg border px-6 py-12 text-center text-muted-foreground">
          No notifications yet.
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="rounded-lg border divide-y">
          {items.map((item) => {
            const style = TYPE_STYLES[item.type] ?? { label: item.type, variant: "outline" as const }
            return (
              <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                <div className="pt-0.5 shrink-0">
                  <Badge variant={style.variant} className="text-xs">{style.label}</Badge>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>

                  {item.lead_id && (
                    <div className="flex items-center gap-2 mt-1">
                      {item.grade && <GradeBadge grade={item.grade} size="sm" />}
                      <Link
                        href={`/leads/${item.lead_id}`}
                        className="text-xs hover:underline text-muted-foreground"
                      >
                        {item.lead_name ?? "View lead"}
                      </Link>
                      {item.value != null && (
                        <RupeeValue amount={item.value} muted className="text-xs" />
                      )}
                    </div>
                  )}
                </div>

                <span className="text-xs text-muted-foreground shrink-0">
                  {timeAgo(item.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
