// Platform ("Mission Control") admin auth — completely separate from the
// per-account getServerSession/requireWorkspace. A platform admin operates
// across ALL tenants, so authorization is intentionally strict:
//   1. email must be in the PLATFORM_ADMIN_EMAILS allowlist (env kill-switch)
//   2. an active row must exist in platform_admins (DB source of truth + roles)
//   3. the session must be MFA-elevated (Supabase AAL2)
// All three are required. Never resolves Account/Workspace scope.

import { prisma } from "@/lib/prisma"
import { createServerClient } from "@/lib/supabase/server"
import { AuthError } from "@/lib/auth/middleware"
import type { PlatformRole } from "@prisma/client"

const DEV_BYPASS =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true"

// MFA (Supabase TOTP / AAL2) enforcement. Disabled for now; re-enable by setting
// PLATFORM_MFA_REQUIRED="true" in the env (then redeploy). Strongly recommended
// to turn back on — a platform admin can impersonate any tenant.
const MFA_REQUIRED = process.env.PLATFORM_MFA_REQUIRED === "true"

export type PlatformSession = {
  authId: string
  email: string
  role: PlatformRole
  mfaEnrolled: boolean // has a verified TOTP factor (Supabase nextLevel === aal2)
  mfaElevated: boolean // this session has completed MFA (currentLevel === aal2)
}

function allowlist(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Resolve the current platform-admin session, or null if the caller is not a
 * valid, active, allowlisted platform admin. MFA state is reported (not
 * enforced here) so the layout can route to enrolment/challenge.
 */
export async function getPlatformSession(): Promise<PlatformSession | null> {
  // Dev/staging convenience: act as the first active platform admin, MFA waived.
  if (DEV_BYPASS) {
    const admin = await prisma.platformAdmin.findFirst({ where: { is_active: true } })
    if (!admin) return null
    return { authId: admin.auth_id, email: admin.email, role: admin.role, mfaEnrolled: true, mfaElevated: true }
  }

  const supabase = createServerClient()
  // getUser hits the auth server and can throw on a stale/invalid token — must
  // not 500 the admin layout. Treat any failure as "not a platform admin".
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    return null
  }
  if (!user?.email) return null

  if (!allowlist().includes(user.email.toLowerCase())) return null

  const admin = await prisma.platformAdmin.findUnique({ where: { auth_id: user.id } })
  if (!admin || !admin.is_active) return null

  // MFA disabled → treat as fully satisfied so the gate passes on email+password.
  if (!MFA_REQUIRED) {
    return { authId: user.id, email: admin.email, role: admin.role, mfaEnrolled: true, mfaElevated: true }
  }

  let aal: Awaited<ReturnType<typeof supabase.auth.mfa.getAuthenticatorAssuranceLevel>>["data"] = null
  try {
    const res = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    aal = res.data
  } catch {
    // Can't resolve MFA state → fail closed (unenrolled/unelevated), which routes
    // the admin to enrolment/challenge rather than crashing the layout.
    return { authId: user.id, email: admin.email, role: admin.role, mfaEnrolled: false, mfaElevated: false }
  }
  return {
    authId: user.id,
    email: admin.email,
    role: admin.role,
    mfaEnrolled: aal?.nextLevel === "aal2",
    mfaElevated: aal?.currentLevel === "aal2",
  }
}

/** True when the session is fully authorized (active admin + MFA elevated). */
export function isFullyAuthorized(s: PlatformSession | null): s is PlatformSession {
  return !!s && s.mfaEnrolled && s.mfaElevated
}

/**
 * API guard. Throws AuthError(401) if not a platform admin, AuthError(403) if
 * MFA isn't satisfied or the role is insufficient. Use as the first line of
 * every admin API route.
 */
export async function requirePlatformAdmin(...roles: PlatformRole[]): Promise<PlatformSession> {
  const session = await getPlatformSession()
  if (!session) throw new AuthError("Not a platform administrator", 401)
  if (!session.mfaEnrolled || !session.mfaElevated) {
    throw new AuthError("MFA required for platform access", 403)
  }
  if (roles.length && !roles.includes(session.role)) {
    throw new AuthError(`Forbidden: requires ${roles.join(" or ")}`, 403)
  }
  return session
}
