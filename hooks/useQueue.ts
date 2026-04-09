"use client"

import { useQuery } from "@tanstack/react-query"

export interface QueueLead {
  id:            string
  first_name:    string
  last_name:     string | null
  phone:         string
  grade:         string
  intent_score:  number
  fit_score:     number
  quality_score: number
  rank_score:    number
  company_name:  string | null
  city:          string | null
  days_in_stage: number
  followups_due: number
  is_snoozed:    boolean
  snooze_until:  string | null
  nba:           { action: string; reason: string } | null
  stage:         { id: string; name: string } | null
}

export interface QueueResponse {
  leads: QueueLead[]
  total: number
}

async function fetchQueue(): Promise<QueueResponse> {
  const res = await fetch("/api/queue", { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch queue")
  return res.json()
}

/**
 * Priority queue hook — 30-second polling interval (TAD 8.5).
 * Refetches on window focus for snappy UX after returning from a call.
 */
export function useQueue() {
  return useQuery<QueueResponse>({
    queryKey:          ["queue"],
    queryFn:           fetchQueue,
    refetchInterval:   30 * 1000,   // 30 seconds
    refetchOnWindowFocus: true,
    staleTime:         25 * 1000,   // consider stale after 25s
  })
}
