/**
 * Where the product tour remembers itself.
 *
 * Browser storage rather than a column on the user, deliberately. Production
 * migrations on this project are run by hand after a deploy, and anything the
 * session reads sits on the critical path of every dashboard page and every
 * guarded API route. A column that ships before its migration does not degrade
 * the tour, it 500s the product. The worst case here is somebody on a second
 * browser being offered the tour again and pressing skip.
 *
 * Keys are namespaced by user id so two accounts sharing a browser do not
 * inherit each other's progress.
 */

/** Bump to re-run the tour for everyone after a meaningful content change. */
export const TOUR_VERSION = 1

/** Set by onboarding immediately before it hands off to the queue. */
export const TOUR_AUTOSTART_KEY = "lk_tour_autostart"

export type TourRecord = {
  v: number
  status: "completed" | "dismissed"
  lastStepId?: string
  at: string
}

const doneKey = (userId: string) => `lk_tour:${userId}`
const progressKey = (userId: string) => `lk_tour_progress:${userId}`

/** Every access is wrapped: Safari private browsing throws on write. */
function read(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(store: Storage | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value)
  } catch {
    /* nothing to do; the tour simply does not remember */
  }
}

function drop(store: Storage | undefined, key: string): void {
  try {
    store?.removeItem(key)
  } catch {
    /* as above */
  }
}

const local = () => (typeof window === "undefined" ? undefined : window.localStorage)
const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage)

/** Has this user already finished or dismissed the current tour? */
export function tourRecord(userId: string): TourRecord | null {
  const raw = read(local(), doneKey(userId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TourRecord
    // A version bump retires old records rather than migrating them.
    return parsed.v === TOUR_VERSION ? parsed : null
  } catch {
    return null
  }
}

export function markTourDone(userId: string, status: TourRecord["status"], lastStepId?: string): void {
  const record: TourRecord = { v: TOUR_VERSION, status, lastStepId, at: new Date().toISOString() }
  write(local(), doneKey(userId), JSON.stringify(record))
  drop(session(), progressKey(userId))
}

export function clearTourRecord(userId: string): void {
  drop(local(), doneKey(userId))
  drop(session(), progressKey(userId))
}

/** In flight position, so a mid tour reload resumes rather than restarting. */
export function readProgress(userId: string): number | null {
  const raw = read(session(), progressKey(userId))
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export function writeProgress(userId: string, index: number): void {
  write(session(), progressKey(userId), String(index))
}

/** Consumes the one shot handoff flag set by onboarding. */
export function takeAutostart(): boolean {
  const flag = read(session(), TOUR_AUTOSTART_KEY) === "1"
  if (flag) drop(session(), TOUR_AUTOSTART_KEY)
  return flag
}
