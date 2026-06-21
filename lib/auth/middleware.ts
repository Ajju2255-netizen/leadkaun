import { NextResponse } from "next/server"
import { getServerSession, type AuthSession, type SessionWorkspace } from "./session"
import type { UserRole } from "@prisma/client"

/** A session guaranteed to have an active workspace. */
export type WorkspaceSession = AuthSession & { workspace: SessionWorkspace }

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403
  ) {
    super(message)
    this.name = "AuthError"
  }
}

/**
 * Asserts the request is authenticated.
 * Throws AuthError(401) if no session found.
 * Returns the session so callers can use user/account without a second lookup.
 */
export async function requireAuth() {
  const session = await getServerSession()
  if (!session) {
    throw new AuthError("Unauthorized", 401)
  }
  return session
}

/**
 * Asserts the current user has one of the given roles.
 * Throws AuthError(401) if not authenticated.
 * Throws AuthError(403) if authenticated but wrong role.
 */
export async function requireRole(...roles: UserRole[]) {
  const session = await requireAuth()
  if (!roles.includes(session.user.role)) {
    throw new AuthError(
      `Forbidden: requires one of [${roles.join(", ")}], got ${session.user.role}`,
      403
    )
  }
  return session
}

/**
 * Asserts the user is authenticated (optionally with a role) AND has an active
 * workspace. Returns a session whose `workspace` is guaranteed non-null, so
 * data routes can scope queries by `session.workspace.id`.
 */
export async function requireWorkspace(...roles: UserRole[]): Promise<WorkspaceSession> {
  const session = roles.length ? await requireRole(...roles) : await requireAuth()
  if (!session.workspace) {
    throw new AuthError("No workspace assigned. Ask an admin to add you to a workspace.", 403)
  }
  return session as WorkspaceSession
}

/**
 * Wraps an AuthError into a proper NextResponse JSON error.
 * Use in API route catch blocks:
 *
 *   catch (e) {
 *     return handleAuthError(e)
 *   }
 */
export function handleAuthError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message, code: "AUTH_ERROR" }, { status: error.status })
  }
  return null
}
