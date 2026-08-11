// ─────────────────────────────────────────────
// ADMIN NOTIFICATION FAN-OUT (Mission Control)
//
// Who gets told, and over which channels. Kept out of the Inngest function so
// the recipient rule has one home and can be unit-reasoned about.
//
// Recipients: the ACTIVE rows in `platform_admins`, intersected with the
// PLATFORM_ADMIN_EMAILS allowlist when that env var is set — exactly the pair
// of checks `getPlatformSession` makes, so nobody who could not log in ever
// receives internal customer data by email. If the table is empty we fall back
// to the allowlist alone (bootstrap case, before the first admin row exists).
//
// Slack is OPTIONAL and env-gated. It is read straight from process.env rather
// than added to lib/env.ts, because that schema throws on anything missing and
// a Slack webhook must never be able to break a deploy.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"

function allowlist(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Email addresses that may receive internal admin notifications. */
export async function getAdminRecipients(): Promise<string[]> {
  const allowed = allowlist()
  let admins: { email: string }[] = []
  try {
    admins = await prisma.platformAdmin.findMany({ where: { is_active: true }, select: { email: true } })
  } catch {
    admins = []
  }

  const fromTable = admins.map((a) => a.email.toLowerCase())
  const merged = allowed.length > 0
    ? fromTable.filter((e) => allowed.includes(e))
    : fromTable

  // Bootstrap: no admin rows yet, but the operator is named in the env.
  if (merged.length === 0 && allowed.length > 0 && fromTable.length === 0) return allowed

  return Array.from(new Set(merged))
}

export function adminUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://admin.localhost:3000"
  return `${base.replace(/\/$/, "")}${path}`
}

export type SlackBlock = { type: string; text?: { type: string; text: string }; fields?: { type: string; text: string }[] }

/**
 * Post to the optional admin Slack webhook. Returns false when no webhook is
 * configured (not an error) or when the post failed (logged, never thrown) —
 * a notification channel must not be able to fail the job that uses it.
 */
export async function postToSlack(text: string, blocks?: SlackBlock[]): Promise<boolean> {
  const url = process.env.ADMIN_SLACK_WEBHOOK_URL
  if (!url) return false
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    })
    if (!res.ok) {
      console.error("[admin-notify] slack post failed", res.status, await res.text().catch(() => ""))
      return false
    }
    return true
  } catch (e) {
    console.error("[admin-notify] slack post threw", e)
    return false
  }
}

export const slackConfigured = () => !!process.env.ADMIN_SLACK_WEBHOOK_URL
