import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/session"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { OfflineProvider } from "@/components/providers/OfflineProvider"
import { AlertListener } from "@/components/providers/AlertListener"
import { ImpersonationBanner } from "@/components/shared/ImpersonationBanner"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()

  if (!session) {
    // Route through logout (clears any stale Supabase cookie) rather than
    // straight to /login — otherwise a valid cookie with an invalid/inactive DB
    // user loops between the middleware bounce and this redirect. See the
    // logout route handler.
    redirect("/api/auth/logout")
  }

  return (
    <OfflineProvider>
      {/* Self-contained admin-impersonation banner (renders only when an admin
          is viewing this workspace). Reads its own cookie — no session coupling. */}
      <ImpersonationBanner />
      {/* Realtime alert toasts (SQL crossed / grade drop / follow-up overdue).
          Mounted once here so it listens on every dashboard page — audit B3:
          the server broadcaster existed but this listener was never mounted. */}
      <AlertListener />
      <DashboardShell session={session}>
        {children}
      </DashboardShell>
    </OfflineProvider>
  )
}
