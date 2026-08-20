"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, Compass, X } from "lucide-react"

import { useCurrentUser } from "@/hooks/useCurrentUser"

const DISMISS_KEY = "lk_resume_setup_dismissed"

/**
 * A way back into the first run, for anyone who did not finish it.
 *
 * /onboarding had exactly one entrance, the redirect straight after signup.
 * Nothing linked to it, no gate sent anyone there, and login always landed on
 * the dashboard. So closing the tab on step one stranded the account: eleven
 * sidebar destinations, no leads, no explanation, and onboarding_completed_at
 * null for good. This is the strip that fixes that.
 *
 * Deliberately a strip and not a redirect. A server layout has no pathname to
 * branch on, doing it in middleware means a database call on every request,
 * and a client redirect flashes the dashboard first. A visible offer they can
 * ignore beats all three.
 */
export function ResumeSetupCard() {
  const { data: session } = useCurrentUser()
  const pathname = usePathname()
  // Read after mount rather than in the initialiser: the initialiser also runs
  // during the server render, where sessionStorage does not exist, so seeding
  // from it would make the first client render disagree with the HTML.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true)
    } catch {
      /* private browsing refuses reads too */
    }
  }, [])

  // The banners in app/(dashboard)/layout.tsx are siblings of DashboardShell,
  // so the chrome stripping the shell does for /onboarding never reaches them.
  // Without this the strip would invite you to go where you already are.
  if (pathname?.startsWith("/onboarding")) return null
  if (dismissed) return null
  if (!session || session.user.role === "REP") return null
  if (session.account.onboardingCompletedAt) return null

  function dismiss() {
    setDismissed(true)
    try {
      // For this session only. Onboarding is two steps; there is no case for
      // burying it permanently behind one click.
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* private browsing refuses writes; the strip simply returns next load */
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6"
      style={{ background: "rgba(14,165,233,0.07)", borderBottom: "1px solid rgba(14,165,233,0.20)" }}
    >
      <span className="inline-flex shrink-0 items-center gap-2">
        <Compass className="h-4 w-4 text-sky-600" strokeWidth={2} />
        <span className="text-[12.5px] font-semibold text-sky-700">Finish setting up</span>
      </span>

      <span className="min-w-0 text-[12.5px] text-ink-soft">
        You have not finished the first run yet. It takes a minute and it is what makes the queue yours.
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-2">
        <Link
          href="/onboarding"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 px-3.5 text-[12px]
                     font-semibold text-white transition-all hover:from-sky-500 hover:to-sky-600 active:scale-[0.97]"
          style={{ color: "#FFFFFF" }}
        >
          Continue setup <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide until next visit"
          className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:text-ink-soft"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  )
}
