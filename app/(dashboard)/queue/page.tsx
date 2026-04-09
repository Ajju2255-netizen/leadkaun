"use client"

import { useQueue } from "@/hooks/useQueue"
import { QueueCard } from "@/components/queue/QueueCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"

export default function QueuePage() {
  const { data, isLoading, error } = useQueue()

  // Daily Execution Score = % of queue actioned (leads with no pending follow-ups)
  const leads     = data?.leads ?? []
  const actioned  = leads.filter((l) => l.followups_due === 0).length
  const execScore = leads.length > 0 ? Math.round((actioned / leads.length) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Priority Queue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data ? `${data.total} leads ranked by score` : "Loading your queue…"}
        </p>
      </div>

      {/* Daily Execution Score */}
      {leads.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Daily Execution Score</span>
            <span className="tabular-nums font-bold">{execScore}%</span>
          </div>
          <Progress value={execScore} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {actioned} of {leads.length} leads actioned today
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load queue. Please refresh the page.
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && leads.length === 0 && !error && (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Your queue is empty. All leads are actioned.
          </p>
        </div>
      )}

      {/* Queue cards */}
      {!isLoading && leads.length > 0 && (
        <div className="space-y-3">
          {leads.map((lead) => (
            <QueueCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  )
}
