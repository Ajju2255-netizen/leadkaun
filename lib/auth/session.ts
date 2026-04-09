import { createServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import type { UserRole } from "@prisma/client"

export type SessionUser = {
  id: string           // Prisma users.id
  authId: string       // Supabase auth.uid
  email: string
  firstName: string
  lastName: string
  role: UserRole
  accountId: string
  isActive: boolean
}

export type SessionAccount = {
  id: string
  name: string
  icpConfigured: boolean
  sqlFitThreshold: number
  sqlIntentThreshold: number
}

export type AuthSession = {
  user: SessionUser
  account: SessionAccount
}

/**
 * Returns the current authenticated session including the user and account
 * from the database. Returns null if not authenticated or user not found.
 *
 * Server-side only — do not call from client components.
 */
export async function getServerSession(): Promise<AuthSession | null> {
  const supabase = createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) return null

  const dbUser = await prisma.user.findUnique({
    where: { auth_id: session.user.id },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          icp_configured: true,
          sql_fit_threshold: true,
          sql_intent_threshold: true,
        },
      },
    },
  })

  if (!dbUser || !dbUser.is_active) return null

  return {
    user: {
      id: dbUser.id,
      authId: dbUser.auth_id,
      email: dbUser.email,
      firstName: dbUser.first_name,
      lastName: dbUser.last_name,
      role: dbUser.role,
      accountId: dbUser.account_id,
      isActive: dbUser.is_active,
    },
    account: {
      id: dbUser.account.id,
      name: dbUser.account.name,
      icpConfigured: dbUser.account.icp_configured,
      sqlFitThreshold: dbUser.account.sql_fit_threshold,
      sqlIntentThreshold: dbUser.account.sql_intent_threshold,
    },
  }
}
