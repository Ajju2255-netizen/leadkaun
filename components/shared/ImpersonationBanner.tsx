import { cookies } from "next/headers"
import { verifyImpersonation, IMPERSONATION_COOKIE } from "@/lib/auth/impersonation"

/**
 * Persistent "an administrator is viewing this workspace" banner. Fully
 * self-contained: reads its own signed cookie, so it adds NO coupling to the
 * customer app's session logic. Renders nothing for normal customer sessions.
 */
export function ImpersonationBanner() {
  const token = cookies().get(IMPERSONATION_COOKIE)?.value
  const marker = verifyImpersonation(token)
  if (!marker) return null

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-[12px] font-semibold text-amber-950">
      <span>
        Viewing this workspace as an administrator ({marker.byEmail}) — all actions are audited.
      </span>
      <form action="/api/auth/impersonate-exit" method="post">
        <button type="submit" className="rounded-full bg-amber-950/15 px-2.5 py-0.5 text-[11px] font-bold hover:bg-amber-950/25 transition-colors">
          Exit
        </button>
      </form>
    </div>
  )
}
