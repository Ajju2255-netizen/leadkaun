"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

import { useCurrentUser } from "@/hooks/useCurrentUser"
import { TOUR_STEPS } from "@/lib/tour/steps"
import { markTourDone, readProgress, tourRecord, writeProgress } from "@/lib/tour/storage"
import { isSample, realWorkspace, switchWorkspace } from "@/lib/workspace/switch"
import { TourOverlay } from "@/components/tour/TourOverlay"
import { useAnchorRect } from "@/components/tour/useAnchorRect"

type TourApi = { start: () => void; available: boolean }

const TourContext = createContext<TourApi>({ start: () => {}, available: false })

/** Lets anything in the dashboard offer a "take the tour" control. */
export function useTour(): TourApi {
  return useContext(TourContext)
}

/**
 * The guided walkthrough.
 *
 * Mounted in app/(dashboard)/layout.tsx, which is the whole reason cross route
 * steps work: the group layout is not remounted by a client navigation, so the
 * step index survives router.push without any of it going through the URL. That
 * matters here because /queue rewrites its own query string from filter state,
 * so a step parameter would not survive anyway.
 *
 * Nothing is stored server side. See lib/tour/storage.ts for why.
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useCurrentUser()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)

  const userId = session?.user.id
  const inSample = isSample(session?.workspace)

  /**
   * Steps this user should see, decided once and then frozen for the run.
   *
   * Freezing is not tidiness. The list depends on whether the sample workspace
   * is active, and a step can change that: walking to the import page moves you
   * out of the sample by design. Recomputing mid tour dropped the sample step
   * from the array, every later index shifted down by one, and a step was
   * silently skipped while the counter went from "7 of 17" to "8 of 16".
   */
  const eligible = useCallback(() => {
    const role = session?.user.role
    return TOUR_STEPS.filter((s) => {
      if (s.roles && role && !s.roles.includes(role)) return false
      if (s.requiresSample && !inSample) return false
      return true
    })
  }, [session?.user.role, inSample])

  const [frozen, setFrozen] = useState<typeof TOUR_STEPS | null>(null)
  const EMPTY = useMemo<typeof TOUR_STEPS>(() => [], [])
  const steps = frozen ?? EMPTY

  const step = active ? steps[index] : undefined
  const onRoute = !!step && pathname === step.route
  const rect = useAnchorRect(step?.anchor, active && onRoute)

  const start = useCallback(() => {
    const list = eligible()
    if (!list.length) return
    setFrozen(list)
    setIndex(Math.min(userId ? readProgress(userId) ?? 0 : 0, list.length - 1))
    setActive(true)
  }, [eligible, userId])

  /**
   * Autostart.
   *
   * This used to wait for a flag the onboarding wizard set on its way out.
   * There is no wizard any more, so the condition is the situation itself:
   * someone in the sample workspace who has not already seen the tour. That is
   * exactly where registration now drops people, and it is the only place the
   * tour makes sense, since every step describes example data.
   *
   * A stored record means finished or dismissed, and it is written on both, so
   * this fires once. Someone who closes the tab mid tour has no record yet and
   * gets picked up again from where they stopped.
   */
  useEffect(() => {
    if (!session || active) return
    if (session.user.role === "REP") return
    if (!inSample) return
    if (userId && tourRecord(userId)) return
    start()
  }, [session, active, inSample, userId, start])

  // Remember where they got to, so a mid tour reload resumes.
  useEffect(() => {
    if (active && userId) writeProgress(userId, index)
  }, [active, index, userId])

  // Steps live on different routes. Navigate, then wait for the route to catch
  // up; the overlay simply does not render until it has.
  useEffect(() => {
    if (!active || !step) return
    if (pathname !== step.route) router.push(step.route)
  }, [active, step, pathname, router])

  const finish = useCallback(
    (status: "completed" | "dismissed") => {
      if (userId) markTourDone(userId, status, steps[index]?.id)
      setActive(false)
      setIndex(0)
      setFrozen(null)
    },
    [userId, steps, index],
  )

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        finish("completed")
        return i
      }
      return i + 1
    })
  }, [steps.length, finish])

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // Keyboard, registered only while the tour is up.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish("dismissed") }
      else if (e.key === "ArrowRight") { e.preventDefault(); next() }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back() }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [active, next, back, finish])

  /** The last step's primary action: leave the demo and go import for real. */
  const goImport = useCallback(async () => {
    finish("completed")
    const target = realWorkspace(session?.workspaces)
    if (target && inSample) await switchWorkspace(target.id, queryClient)
    router.push("/leads/import")
    router.refresh()
  }, [finish, session?.workspaces, inSample, queryClient, router])

  const api = useMemo<TourApi>(() => ({ start, available: true }), [start])

  return (
    <TourContext.Provider value={api}>
      {children}
      {active && step && onRoute && (
        <TourOverlay
          step={step}
          rect={rect}
          index={index}
          total={steps.length}
          isLast={index === steps.length - 1}
          onNext={next}
          onBack={back}
          onSkip={() => finish("dismissed")}
          onPrimary={goImport}
          primaryLabel="Import my leads"
        />
      )}
    </TourContext.Provider>
  )
}
