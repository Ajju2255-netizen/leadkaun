"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { createClient } from "@supabase/supabase-js"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useQueryClient } from "@tanstack/react-query"

/**
 * AlertListener — TAD Section 8.4
 *
 * Mount once in the dashboard layout (not per-page).
 * Subscribes to the Supabase Realtime broadcast channel `alerts:{userId}`.
 *
 * Handles two alert types:
 *
 * - `sql_crossed`    — Lead just became Sales-Qualified. Shows a celebratory
 *                      toast with link to the lead record.
 *
 * - `grade_dropped`  — Lead grade dropped (e.g. A → C). Shows a warning toast
 *                      with old/new grade and days since last contact.
 *
 * - `follow_up_overdue` — One or more of the rep's follow-ups just went OVERDUE
 *                         (fired by follow-up-overdue Inngest function).
 *
 * The Inngest functions (Phase 5) fire the `alerts/*` events. Supabase Realtime
 * delivers them to the connected browser client for the matching userId.
 */
export function AlertListener() {
  const { data: session } = useCurrentUser()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!session?.user?.id) return

    const userId  = session.user.id
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const channel = supabase
      .channel(`alerts:${userId}`)
      .on("broadcast", { event: "sql_crossed" }, ({ payload }) => {
        toast.success(`SQL Alert: ${payload.lead_name} crossed the SQL threshold`, {
          description: `Grade ${payload.grade} · ${payload.company_name ?? ""}`,
          action: {
            label: "View Lead",
            onClick: () => { window.location.href = `/leads/${payload.lead_id}` },
          },
          duration: 8000,
        })
        // Invalidate lead-related queries so open pages reflect the new SQL status
        queryClient.invalidateQueries({ queryKey: ["lead", payload.lead_id] })
        queryClient.invalidateQueries({ queryKey: ["queue"] })
      })
      .on("broadcast", { event: "grade_dropped" }, ({ payload }) => {
        toast.warning(
          `Grade Drop: ${payload.lead_name} dropped from ${payload.from_grade} → ${payload.to_grade}`,
          {
            description: `${payload.days_since_contact} days since last contact · ₹${(payload.expected_value ?? 0).toLocaleString("en-IN")} at risk`,
            action: {
              label: "View Lead",
              onClick: () => { window.location.href = `/leads/${payload.lead_id}` },
            },
            duration: 10000,
          },
        )
        queryClient.invalidateQueries({ queryKey: ["lead", payload.lead_id] })
      })
      .on("broadcast", { event: "follow_up_overdue" }, ({ payload }) => {
        const count = payload.overdue_count as number
        const aCount = payload.grade_a_count as number
        toast.warning(
          `${count} follow-up${count !== 1 ? "s" : ""} overdue`,
          {
            description: aCount > 0
              ? `${aCount} Grade A lead${aCount !== 1 ? "s" : ""} need urgent attention`
              : "Check your follow-up queue",
            action: {
              label: "View Queue",
              onClick: () => { window.location.href = "/queue" },
            },
            duration: 12000,
          },
        )
        queryClient.invalidateQueries({ queryKey: ["follow-ups"] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, queryClient])

  // Renders nothing — side-effect only
  return null
}
