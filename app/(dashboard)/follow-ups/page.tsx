"use client"

import { useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { timeAgo } from "@/lib/format"

interface FollowUpAction {
  id:              string
  action_type:     string
  status:          string
  due_date:        string
  notes:           string | null
  lead: {
    id:           string
    first_name:   string
    last_name:    string | null
    grade:        string
    company_name: string | null
    phone:        string
  }
}

const ACTION_LABELS: Record<string, string> = {
  CALL:      "Call",
  WHATSAPP:  "WhatsApp",
  VISIT:     "Site Visit",
  FOLLOW_UP: "Follow Up",
  OTHER:     "Other",
}

async function fetchFollowUps(repId?: string): Promise<{ actions: FollowUpAction[]; total: number }> {
  const qs  = repId ? `?rep_id=${repId}` : ""
  const res = await fetch(`/api/follow-ups${qs}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch follow-ups")
  return res.json()
}

async function fetchTeam(): Promise<{ members: { id: string; first_name: string; last_name: string }[] }> {
  const res = await fetch("/api/team/members", { credentials: "include" })
  if (!res.ok) return { members: [] }
  return res.json()
}

export default function FollowUpsPage() {
  const { data: session } = useCurrentUser()
  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER"
  const queryClient = useQueryClient()

  const [repFilter, setRepFilter] = useState("all")
  const [completing, setCompleting] = useState<string | null>(null)
  const [skipping, setSkipping]     = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey:  ["follow-ups", repFilter],
    queryFn:   () => fetchFollowUps(repFilter === "all" ? undefined : repFilter),
    refetchInterval: 30_000,
  })

  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn:  fetchTeam,
    enabled:  isManager,
  })

  const complete = useCallback(async (id: string) => {
    setCompleting(id)
    try {
      const res = await fetch(`/api/follow-ups/${id}/complete`, {
        method: "POST", credentials: "include",
      })
      if (res.ok) {
        toast.success("Follow-up marked complete")
        queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      } else {
        toast.error("Failed to complete")
      }
    } finally {
      setCompleting(null)
    }
  }, [queryClient])

  const skip = useCallback(async (id: string) => {
    setSkipping(id)
    try {
      const res = await fetch(`/api/follow-ups/${id}/skip`, {
        method: "POST", credentials: "include",
      })
      if (res.ok) {
        toast.success("Snoozed 24 hours")
        queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      } else {
        toast.error("Failed to skip")
      }
    } finally {
      setSkipping(null)
    }
  }, [queryClient])

  const actions  = data?.actions ?? []
  const overdue  = actions.filter((a) => a.status === "OVERDUE")
  const pending  = actions.filter((a) => a.status === "PENDING")

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${actions.length} due today${overdue.length > 0 ? ` · ${overdue.length} overdue` : ""}`}
          </p>
        </div>

        {isManager && teamData && teamData.members.length > 0 && (
          <Select value={repFilter} onValueChange={(v) => setRepFilter(v ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {teamData.members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {!isLoading && actions.length === 0 && (
        <div className="rounded-lg border px-6 py-12 text-center text-muted-foreground">
          All clear — no follow-ups due today.
        </div>
      )}

      {/* Overdue section */}
      {overdue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-destructive">Overdue</h2>
            <Badge variant="destructive" className="text-xs">{overdue.length}</Badge>
          </div>
          <div className="space-y-2">
            {overdue.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                isOverdue
                completing={completing === action.id}
                skipping={skipping === action.id}
                onComplete={() => complete(action.id)}
                onSkip={() => skip(action.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending section */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Due Today</h2>
          <div className="space-y-2">
            {pending.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                isOverdue={false}
                completing={completing === action.id}
                skipping={skipping === action.id}
                onComplete={() => complete(action.id)}
                onSkip={() => skip(action.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionCard({
  action,
  isOverdue,
  completing,
  skipping,
  onComplete,
  onSkip,
}: {
  action:     FollowUpAction
  isOverdue:  boolean
  completing: boolean
  skipping:   boolean
  onComplete: () => void
  onSkip:     () => void
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 flex items-center gap-4 ${isOverdue ? "border-destructive/40 bg-destructive/5" : ""}`}>
      <GradeBadge grade={action.lead.grade} size="sm" />

      <div className="flex-1 min-w-0">
        <Link href={`/leads/${action.lead.id}`} className="font-medium hover:underline text-sm">
          {action.lead.first_name} {action.lead.last_name}
        </Link>
        {action.lead.company_name && (
          <p className="text-xs text-muted-foreground">{action.lead.company_name}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs">
            {ACTION_LABELS[action.action_type] ?? action.action_type}
          </Badge>
          <span className="text-xs text-muted-foreground">{timeAgo(action.due_date)}</span>
        </div>
        {action.notes && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{action.notes}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm" variant="outline"
          disabled={skipping}
          onClick={onSkip}
          className="text-xs"
        >
          Skip
        </Button>
        <Button
          size="sm"
          disabled={completing}
          onClick={onComplete}
          className="text-xs"
        >
          Done
        </Button>
      </div>
    </div>
  )
}
