"use client"

import { useQuery } from "@tanstack/react-query"

export type ImportJobStatus = "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED"

export interface ImportStatus {
  id:           string
  status:       ImportJobStatus
  total_rows:   number | null
  inserted:     number
  duplicates:   number
  errors:       number
  progress_pct: number
  completed_at: string | null
  created_at:   string
}

async function fetchImportStatus(jobId: string): Promise<ImportStatus> {
  const res = await fetch(`/api/import/status/${jobId}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to fetch import status")
  return res.json()
}

/**
 * Import job status hook.
 *
 * Polls every 2 seconds while the job is PENDING or PROCESSING.
 * Stops polling once COMPLETE or FAILED.
 *
 * Usage:
 *   const { data } = useImportStatus(jobId)
 *   // data.progress_pct drives the progress bar in the upload UI
 */
export function useImportStatus(jobId: string | null) {
  return useQuery<ImportStatus>({
    queryKey: ["import-status", jobId],
    queryFn:  () => fetchImportStatus(jobId!),
    enabled:  !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Poll every 2s while active; stop when terminal
      if (!status || status === "PENDING" || status === "PROCESSING") return 2000
      return false
    },
    staleTime: 1000,
  })
}
