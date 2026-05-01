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
  previous_grade: string | null
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
  follow_up_actions:    { due_date: string; status: string }[]
  hours_since_import:   number | null
  last_action_at:           string | null
  last_signal_at:           string | null
  last_signal_type:         string | null
  minutes_since_last_signal: number | null
  is_hot_signal:            boolean
}

export interface GradeSummary {
  grade:       string
  count:       number
  total_value: number
  action:      NextAction
}

export interface QueueResponse {
  leads:           QueueLead[]
  grouped:         Record<string, QueueLead[]>
  summary:         GradeSummary[]
  total:           number
  contacted_today: number
}

async function fetchQueue(repId?: string): Promise<QueueResponse> {
  const url = repId ? `/api/queue?rep=${repId}` : "/api/queue"
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch queue")
  return res.json()
}

/**
 * Priority queue hook — 30-second polling, refetch on window focus.
 * @param repId Optional rep filter (managers only)
 */
export function useQueue(repId?: string) {
  return useQuery<QueueResponse>({
    queryKey:             ["queue", repId ?? "all"],
    queryFn:              () => fetchQueue(repId),
    refetchInterval:      30 * 1000,
    refetchOnWindowFocus: true,
    staleTime:            25 * 1000,
  })
}
