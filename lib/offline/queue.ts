/**
 * Offline action queue — persists pending signal logs to localStorage
 * when the device is offline. Synced to the server on reconnect.
 *
 * Usage:
 *   enqueueOfflineAction({ url, method, body })
 *   flushOfflineQueue()        ← called automatically on "online" event
 */

export interface OfflineAction {
  id:        string
  url:       string
  method:    string
  body:      Record<string, unknown>
  queuedAt:  number
}

const STORAGE_KEY = "lk_offline_queue"
const MAX_AGE_MS  = 24 * 60 * 60 * 1000  // discard actions older than 24h

function readQueue(): OfflineAction[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const items = JSON.parse(raw) as OfflineAction[]
    // Discard stale items
    const cutoff = Date.now() - MAX_AGE_MS
    return items.filter((a) => a.queuedAt > cutoff)
  } catch {
    return []
  }
}

function writeQueue(items: OfflineAction[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage full or unavailable — silently discard
  }
}

export function enqueueOfflineAction(action: Omit<OfflineAction, "id" | "queuedAt">): void {
  const queue = readQueue()
  queue.push({
    ...action,
    id:       crypto.randomUUID(),
    queuedAt: Date.now(),
  })
  writeQueue(queue)
}

export function getOfflineQueueLength(): number {
  return readQueue().length
}

export async function flushOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = readQueue()
  if (queue.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0
  const remaining: OfflineAction[] = []

  for (const action of queue) {
    try {
      const res = await fetch(action.url, {
        method:  action.method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(action.body),
      })
      if (res.ok) {
        synced++
      } else {
        // Non-retriable errors (4xx) — drop them
        if (res.status >= 400 && res.status < 500) {
          console.warn(`Offline action dropped (${res.status}):`, action.url)
        } else {
          remaining.push(action)
          failed++
        }
      }
    } catch {
      // Network still unavailable — keep in queue
      remaining.push(action)
      failed++
    }
  }

  writeQueue(remaining)
  return { synced, failed }
}
