"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createBrowserClient } from "@supabase/auth-helpers-nextjs"

/**
 * LeadRealtimeListener — TAD Section 8.3
 *
 * Mount on the lead record page only (`leads/[id]`).
 * Subscribes to the Supabase Realtime channel `lead:{leadId}`.
 *
 * When a postgres_changes event fires (UPDATE on the leads table for this
 * lead), it invalidates all React Query keys related to this lead so the
 * page re-fetches fresh data — including updated grade, scores, and NBA.
 *
 * The actual data push is triggered by the `fn_notify_lead_updated` Postgres
 * function defined in supabase/migrations/001_notify_trigger.sql.
 */
interface Props {
  leadId: string
}

export function LeadRealtimeListener({ leadId }: Props) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const channel = supabase
      .channel(`lead:${leadId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "leads",
          filter: `id=eq.${leadId}`,
        },
        () => {
          // Invalidate all queries for this lead — triggers re-fetch
          queryClient.invalidateQueries({ queryKey: ["lead", leadId] })
          queryClient.invalidateQueries({ queryKey: ["lead", leadId, "signals"] })
          queryClient.invalidateQueries({ queryKey: ["lead", leadId, "timeline"] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leadId, queryClient])

  // Renders nothing — side-effect only
  return null
}
