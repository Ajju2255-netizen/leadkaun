import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/session"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { OfflineProvider } from "@/components/providers/OfflineProvider"
import { AlertListener } from "@/components/providers/AlertListener"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <OfflineProvider>
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
