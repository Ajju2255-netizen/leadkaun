// Signed marker for an impersonated customer session. Set on app.leadkaun.com
// when a platform admin "logs in as" a customer (see the impersonation flow).
// Read ONLY by ImpersonationBanner, which renders a persistent banner. Note what
// that means: getServerSession does not consult this marker and AuthSession has
// no `impersonating` field, so at the API layer an impersonated session is
// indistinguishable from the real customer — writes are attributed to the
// customer user, and only impersonation_logs' start/end timestamps correlate
// them back. Encrypted with the app ENCRYPTION_KEY (lib/crypto).

import { encrypt, decrypt } from "@/lib/crypto"

export const IMPERSONATION_COOKIE = "lk_impersonation"

export type ImpersonationMarker = {
  logId: string
  byEmail: string
  accountId: string
  exp: number // epoch ms
}

export function signImpersonation(marker: ImpersonationMarker): string {
  return encrypt(JSON.stringify(marker))
}

export function verifyImpersonation(token: string | undefined | null): ImpersonationMarker | null {
  if (!token) return null
  try {
    const marker = JSON.parse(decrypt(token)) as ImpersonationMarker
    if (!marker?.logId || typeof marker.exp !== "number" || marker.exp < Date.now()) return null
    return marker
  } catch {
    return null
  }
}
