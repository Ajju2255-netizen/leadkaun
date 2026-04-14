"use client"

import { useQuery } from "@tanstack/react-query"

export interface NextAction {
  label:    string
  priority: number
  reason:   string
  color:    string
}

export interface QueueLead {
  id:             string
  first_name:     string
  last_name:      string | null
  phone:          string
  grade:          string
  intent_score:   number
  fit_score:      number
  quality_score:  number
  company_name:   string | null
  city:           string | null
  state:          string | null
  expected_value: number | null
  inquiry_text:   string | null
  next_action:    NextAction
  stage:          { id: string; name: string } | null
  follow_up_actions: { due_date: string; status: string }[]
}

export interface GradeSummary {
  grade:       string
  count:       number
  total_value: number
  action:      NextAction
}

export interface QueueResponse {
  leads:   QueueLead[]
  grouped: Record<string, QueueLead[]>
  summary: GradeSummary[]
  total:   number
}

async function fetchQueue(): Promise<QueueResponse> {
  const res = await fetch("/api/queue", { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch queue")
  return res.json()
}

/**
 * Priority queue hook — 30-second polling, refetch on window focus.
 */
export function useQueue() {
  return useQuery<QueueResponse>({
    queryKey:             ["queue"],
    queryFn:              fetchQueue,
    refetchInterval:      30 * 1000,
    refetchOnWindowFocus: true,
    staleTime:            25 * 1000,
  })
}
