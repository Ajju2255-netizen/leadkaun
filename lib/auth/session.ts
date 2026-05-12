import { createServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import type { UserRole } from "@prisma/client"

/**
 * Dev-only bypass: when DEV_AUTH_BYPASS=true (AND NODE_ENV !== production),
 * `getServerSession` synthesises a session from the first ADMIN in the DB
 * instead of consulting Supabase cookies. Used for local preview without
 * needing to seed the e2e user. The middleware respects the same flag.
 *
 * SAFETY: the production guard is non-negotiable — even if someone leaks
 * DEV_AUTH_BYPASS=true into Vercel env, the NODE_ENV check blocks the bypass.
 */
const DEV_BYPASS =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true"

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
  let dbUser

  if (DEV_BYPASS) {
    // Pick the first active ADMIN as the synthetic session. Falls back to
    // any active user if no admin exists. Returns null if the DB is empty.
    dbUser = await prisma.user.findFirst({
      where: { is_active: true, role: "ADMIN" },
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
    if (!dbUser) {
      dbUser = await prisma.user.findFirst({
        where: { is_active: true },
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
    }
    if (!dbUser) {
      console.warn("[auth] DEV_AUTH_BYPASS active but no users in DB — returning null session")
      return null
    }
  } else {
    const supabase = createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) return null

    dbUser = await prisma.user.findUnique({
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
  }

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
