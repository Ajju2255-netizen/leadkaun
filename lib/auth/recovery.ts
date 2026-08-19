// ─────────────────────────────────────────────
// PASSWORD-RECOVERY GATE
//
// Supabase cannot change a password without an authenticated session, so a
// recovery link necessarily signs the user in. That is unavoidable — what is
// avoidable is letting that session roam the product.
//
// A recovery link therefore lands on /set-password carrying this cookie, and
// middleware confines the session to that one page until a new password is
// actually set. The link is a password-reset, not a back door into the account.
// ─────────────────────────────────────────────

export const RECOVERY_COOKIE = "lk_pwreset"

/** The only path a recovery-gated session may reach. */
export const RECOVERY_PATH = "/set-password"

/**
 * Matches Supabase's recovery-link validity. A hard expiry matters: it is the
 * backstop that guarantees a half-finished reset cannot strand an account, no
 * matter how the browser was closed.
 */
export const RECOVERY_MAX_AGE = 60 * 30

export const recoveryCookieOptions = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path:     "/",
}
