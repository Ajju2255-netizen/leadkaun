import { cookies } from "next/headers"
import { createServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import type { UserRole } from "@prisma/client"

/** Cookie that pins the active workspace for the session. */
export const WORKSPACE_COOKIE = "lk_ws"

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

export type SessionWorkspace = {
  id: string
  name: string
  slug: string
  isDefault: boolean
}

export type AuthSession = {
  user: SessionUser
  account: SessionAccount
  /** The active workspace, or null if this user has none assigned yet. */
  workspace: SessionWorkspace | null
  /** Every workspace this user can access (ADMIN: all; others: assigned). */
  workspaces: SessionWorkspace[]
}

/**
 * Resolve the user's accessible workspaces + the active one. ADMIN sees every
 * (non-archived) workspace in the account; MANAGER/REP see only the ones they
 * are a member of. Active = the `lk_ws` cookie if it's accessible, else the
 * default, else the first — or null when the user has no workspace at all.
 */
async function resolveWorkspaces(
  accountId: string,
  userId: string,
  role: UserRole,
): Promise<{ workspace: SessionWorkspace | null; workspaces: SessionWorkspace[] }> {
  const rows = role === "ADMIN"
    ? await prisma.workspace.findMany({
        where: { account_id: accountId, archived_at: null },
        orderBy: [{ is_default: "desc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true, is_default: true },
      })
    : (await prisma.workspaceMember.findMany({
        where: { user_id: userId, workspace: { account_id: accountId, archived_at: null } },
        orderBy: { workspace: { is_default: "desc" } },
        select: { workspace: { select: { id: true, name: true, slug: true, is_default: true } } },
      })).map((m) => m.workspace)

  const workspaces: SessionWorkspace[] = rows.map((w) => ({
    id: w.id, name: w.name, slug: w.slug, isDefault: w.is_default,
  }))
  if (workspaces.length === 0) return { workspace: null, workspaces }

  let activeId: string | undefined
  try { activeId = (await cookies()).get(WORKSPACE_COOKIE)?.value } catch { /* not in a request scope */ }

  const active =
    workspaces.find((w) => w.id === activeId) ??
    workspaces.find((w) => w.isDefault) ??
    workspaces[0]

  return { workspace: active, workspaces }
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
    // A stale/revoked refresh token makes getSession throw (AuthApiError:
    // Invalid Refresh Token). Treat any failure as unauthenticated rather than
    // 500ing the layout/API — the caller redirects to /login.
    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null
    try {
      const { data } = await supabase.auth.getSession()
      session = data.session
    } catch {
      return null
    }

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

  const { workspace, workspaces } = await resolveWorkspaces(dbUser.account_id, dbUser.id, dbUser.role)

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
    workspace,
    workspaces,
  }
}
