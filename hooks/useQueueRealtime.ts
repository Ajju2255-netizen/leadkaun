"use client"

/**
 * useQueueRealtime — subscribes to Postgres change feed on `leads` and
 * `signals` for the current account and invalidates the React Query cache
 * for the queue on any change. Throttled so a burst of signals doesn't
 * thrash the network.
 *
 * Falls back gracefully if the channel can't connect — the queue still
 * polls every 30s via useQueue.
 *
 * Returns the realtime connection status so the UI can show a live indicator.
 */

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export type RealtimeStatus = "connecting" | "live" | "offline"

const INVALIDATE_THROTTLE_MS = 1500

export function useQueueRealtime(accountId?: string | null): RealtimeStatus {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<RealtimeStatus>("connecting")
  const lastInvalidate = useRef<number>(0)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!accountId) return
    const supabase = getSupabaseBrowserClient()

    function invalidate() {
      const now = Date.now()
      const sinceLast = now - lastInvalidate.current
      if (sinceLast >= INVALIDATE_THROTTLE_MS) {
        lastInvalidate.current = now
        queryClient.invalidateQueries({ queryKey: ["queue"] })
        return
      }
      // Coalesce — schedule one invalidation at the end of the throttle window
      if (pendingTimer.current) return
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null
        lastInvalidate.current = Date.now()
        queryClient.invalidateQueries({ queryKey: ["queue"] })
      }, INVALIDATE_THROTTLE_MS - sinceLast)
    }

    const channel = supabase
      .channel(`queue:${accountId}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "leads",
          filter: `account_id=eq.${accountId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "signals",
          filter: `account_id=eq.${accountId}`,
        },
        invalidate,
      )
      .subscribe((channelStatus) => {
        if (channelStatus === "SUBSCRIBED")     setStatus("live")
        else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT" || channelStatus === "CLOSED")
          setStatus("offline")
        else setStatus("connecting")
      })

    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      supabase.removeChannel(channel)
    }
  }, [accountId, queryClient])

  return status
}
