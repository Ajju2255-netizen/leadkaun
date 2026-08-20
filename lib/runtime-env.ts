/**
 * Is this the real production deployment?
 *
 * Anything that leaves the process and reaches a human or a vendor — the admin
 * Slack channel, transactional email, ad platform conversion events — has to
 * ask this before it fires.
 *
 * The reason it needs asking at all: local development deliberately runs against
 * production credentials. `.env.local` carries the production Supabase project,
 * the production Resend key and the production Slack webhook, because the local
 * app is expected to talk to the real auth project. That makes "the credential
 * is present" worthless as evidence that the caller is production, which is the
 * check every one of these call sites was making. A single signup run against
 * localhost posted an invented name and phone number into the founders' Slack,
 * indistinguishable from a real customer, and sent a real welcome email to the
 * address it had made up.
 *
 * VERCEL_ENV is injected by the platform. It is "production" only on the
 * production deployment, "preview" on preview builds, and absent locally.
 * NODE_ENV cannot stand in for it: a local `next start` also reports
 * "production", which is exactly the case that would still leak.
 */
export function isProductionRuntime(): boolean {
  if (process.env.ALLOW_PROD_SIDE_EFFECTS === "true") return true
  return process.env.VERCEL_ENV === "production"
}

/**
 * The browser half of the same question.
 *
 * VERCEL_ENV is a server variable and is not exposed to the client, so the
 * browser has to judge by where it is actually running. Only the real product
 * host counts: localhost, preview URLs on vercel.app and the admin host all
 * return false, so none of them can write conversions into the ad accounts.
 */
const PRODUCTION_APP_HOST = "app.leadkaun.com"

export function isProductionBrowser(): boolean {
  if (typeof window === "undefined") return false
  return window.location.hostname === PRODUCTION_APP_HOST
}
