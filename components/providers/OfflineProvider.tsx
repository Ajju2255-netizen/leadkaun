"use client"

import { useEffect, useState } from "react"
import { flushOfflineQueue, getOfflineQueueLength } from "@/lib/offline/queue"
import { useQueryClient } from "@tanstack/react-query"

/**
 * Mounts once at the dashboard level.
 *
 * - Shows an offline banner when navigator.onLine is false.
 * - On reconnect ("online" event): flushes the offline queue, then invalidates
 *   lead + queue React Query caches so UI reflects the synced data.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [isOffline, setIsOffline] = useState(false)
  const [syncMsg, setSyncMsg]     = useState("")

  useEffect(() => {
    function handleOffline() {
      setIsOffline(true)
      setSyncMsg("")
    }

    async function handleOnline() {
      setIsOffline(false)
      const queued = getOfflineQueueLength()
      if (queued === 0) return

      const { synced } = await flushOfflineQueue()
      if (synced > 0) {
        setSyncMsg(`${synced} offline action${synced > 1 ? "s" : ""} synced`)
        qc.invalidateQueries({ queryKey: ["queue"] })
        qc.invalidateQueries({ queryKey: ["lead"] })
        setTimeout(() => setSyncMsg(""), 5000)
      }
    }

    // Set initial state
    if (!navigator.onLine) setIsOffline(true)

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online",  handleOnline)

    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online",  handleOnline)
    }
  }, [qc])

  return (
    <>
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 text-sm font-medium text-center py-2 px-4">
          Working offline — changes will sync when connected.
        </div>
      )}
      {syncMsg && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white text-sm font-medium text-center py-2 px-4">
          {syncMsg}
        </div>
      )}
      {children}
    </>
  )
}
