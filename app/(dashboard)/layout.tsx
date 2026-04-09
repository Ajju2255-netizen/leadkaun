import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/session"
import { DashboardShell } from "@/components/layout/DashboardShell"
import { OfflineProvider } from "@/components/providers/OfflineProvider"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <OfflineProvider>
      <DashboardShell session={session}>
        {children}
      </DashboardShell>
    </OfflineProvider>
  )
}
