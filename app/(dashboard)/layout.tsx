import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/session"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { OfflineProvider } from "@/components/providers/OfflineProvider"
import { AlertListener } from "@/components/providers/AlertListener"
import { ImpersonationBanner } from "@/components/shared/ImpersonationBanner"
import { SampleWorkspaceBanner } from "@/components/layout/SampleWorkspaceBanner"
import { ResumeSetupCard } from "@/components/onboarding/ResumeSetupCard"
import { TourProvider } from "@/components/tour/TourProvider"

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
      {/* Example-lead workspace notice. Mounted here rather than per-page so the
          sample is visibly different on EVERY screen — a demo that looks like
          the real product invites the user to think these leads are theirs. */}
      <SampleWorkspaceBanner />
      {/* A way back into the first run for anyone who did not finish it.
          /onboarding had one entrance and no return path, so closing the tab
          stranded the account permanently. */}
      <ResumeSetupCard />
      {/* Realtime alert toasts (SQL crossed / grade drop / follow-up overdue).
          Mounted once here so it listens on every dashboard page — audit B3:
          the server broadcaster existed but this listener was never mounted. */}
      <AlertListener />
      {/* Wraps the shell rather than sitting inside it: the group layout
          survives client navigation, which is what lets a tour step on one
          route continue onto the next without going through the URL. */}
      <TourProvider>
        <DashboardShell session={session}>
          {children}
        </DashboardShell>
      </TourProvider>
    </OfflineProvider>
  )
}
