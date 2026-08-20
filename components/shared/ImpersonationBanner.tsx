import { cookies } from "next/headers"
import { Eye } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { verifyImpersonation, IMPERSONATION_COOKIE } from "@/lib/auth/impersonation"

/**
 * A quiet reminder that you are acting as someone else.
 *
 * Worth being clear about who sees this, because it is easy to assume wrong:
 * it renders for whoever holds the impersonation cookie, which is the admin,
 * in the admin's own browser. The customer is in their own session and never
 * sees it.
 *
 * It used to be a full width amber alarm, which read as a warning aimed at the
 * customer. It is now a thin strip, but it stays for two reasons. It is the
 * only thing telling an admin that the account they are about to change is not
 * their own, and the marker lasts an hour. And it holds the only Exit control,
 * so removing it would leave no way back out.
 *
 * Self contained: reads its own signed cookie, so it adds no coupling to the
 * customer app's session logic, and renders nothing for a normal session.
 */
export async function ImpersonationBanner() {
  const token = cookies().get(IMPERSONATION_COOKIE)?.value
  const marker = verifyImpersonation(token)
  if (!marker) return null

  // Naming the account is the useful part. Best effort: a lookup failure must
  // never take down every dashboard page.
  let accountName: string | null = null
  try {
    const account = await prisma.account.findUnique({
      where: { id: marker.accountId },
      select: { name: true },
    })
    accountName = account?.name ?? null
  } catch {
    accountName = null
  }

  return (
    <div
      className="flex items-center justify-center gap-2.5 px-4 py-1.5 text-[11.5px]"
      style={{ background: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.28)" }}
    >
      <Eye className="h-3.5 w-3.5 shrink-0 text-amber-600" strokeWidth={2.2} />
      <span className="text-ink-soft">
        You are viewing{" "}
        <span className="font-semibold text-ink">{accountName ?? "this workspace"}</span> as an
        administrator. Anything you do here is recorded.
      </span>
      <form action="/api/auth/impersonate-exit" method="post">
        <button
          type="submit"
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/15"
        >
          Exit
        </button>
      </form>
    </div>
  )
}
