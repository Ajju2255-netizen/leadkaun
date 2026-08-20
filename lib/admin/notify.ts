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
import { isProductionRuntime } from "@/lib/runtime-env"

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

  // The webhook being present is not evidence that this is production: .env.local
  // carries the real one so the local app can talk to the real services. Two QA
  // signups run against localhost therefore reached the founders' channel
  // announcing a customer who did not exist, with a phone number that had been
  // invented for the test. An alert channel nobody can trust is worse than none.
  if (!isProductionRuntime()) {
    console.info("[admin-notify] slack post skipped, not a production runtime:", text.slice(0, 120))
    return false
  }
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

// ── New-signup alert ──────────────────────────────────────────────────────────
//
// Two paths announce a signup, and they deliberately do NOT overlap:
//
//   · Slack fires INSTANTLY from the register action — that is the phone buzz.
//   · Email fires from the 15-minute `signup-alert` job — that is the channel of
//     record, with the watermark that guarantees at-least-once delivery.
//
// The job used to post to Slack as well. It no longer does: with the instant
// path in place that would double-notify on every single signup, which is a
// different failure from the "rare duplicate" the job's watermark tolerates.
// If the instant post fails, the email still arrives within 15 minutes.

export type SignupAlertItem = {
  accountId: string
  name: string
  ownerName?: string | null
  ownerEmail?: string | null
  /** Collected at registration since 2026-08-19. Unverified — no OTP is sent. */
  ownerPhone?: string | null
  industry?: string | null
  city?: string | null
  state?: string | null
  teamSize?: string | null
  leadVolume?: string | null
  source?: string | null
  campaign?: string | null
  country?: string | null
  signedUpAt?: Date | string | null
}

const IST = (d: Date | string) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  }) + " IST"

/** Title-case a SCREAMING_SNAKE enum for humans: BETWEEN_50_200 → "50–200". */
const prettyEnum = (v: string) =>
  v.replace(/^BETWEEN_/, "").replace(/^UNDER_/, "under ").replace(/^OVER_/, "over ")
   .replace(/_/g, "–").toLowerCase()

/**
 * One signup, rendered as its own small block rather than a single cramped
 * line. Every field is optional and omitted when absent — an instant alert
 * fires before onboarding, so industry/city/team size genuinely do not exist
 * yet, and rendering them as blanks would read as "not provided" rather than
 * "not asked yet".
 */
function signupLines(s: SignupAlertItem): string {
  const out = [`*${s.name}*`]

  const who = [s.ownerName, s.ownerEmail, s.ownerPhone].filter(Boolean).join(" · ")
  if (who) out.push(`👤 ${who}`)

  const biz = [
    [s.industry, s.city, s.state].filter(Boolean).join(" · "),
    s.teamSize && `team ${prettyEnum(s.teamSize)}`,
    s.leadVolume && `${prettyEnum(s.leadVolume)} leads/mo`,
  ].filter(Boolean).join(" · ")
  if (biz) out.push(`🏢 ${biz}`)

  const attr = [
    s.source ? `via ${s.source}` : "direct / unattributed",
    s.campaign, s.country,
  ].filter(Boolean).join(" · ")
  out.push(`🌐 ${attr}`)

  if (s.signedUpAt) out.push(`🕐 ${IST(s.signedUpAt)}`)
  out.push(`<${adminUrl(`/accounts/${s.accountId}`)}|Open in Mission Control →>`)

  return out.join("\n")
}

/**
 * Post new signups to Slack. Safe to await anywhere: it resolves false rather
 * than throwing when Slack is unconfigured or the post fails, so a notification
 * channel can never fail a registration.
 */
export async function announceSignupsToSlack(items: SignupAlertItem[]): Promise<boolean> {
  if (items.length === 0 || !slackConfigured()) return false
  const header = items.length === 1 ? "🎉 New Leadkaun signup" : `🎉 ${items.length} new Leadkaun signups`
  try {
    return await postToSlack(`${header}\n\n${items.map(signupLines).join("\n\n")}`)
  } catch (e) {
    console.error("[admin-notify] signup slack failed", e)
    return false
  }
}

/**
 * The second half of the story. Fired once, from PATCH /api/profile/account,
 * the first time an account fills in the details that registration never asks
 * for — industry, city, state, team size, monthly lead volume. Same guarantees
 * as the signup post: never throws, no-ops without a webhook.
 */
export async function announceProfileCompletedToSlack(item: SignupAlertItem): Promise<boolean> {
  if (!slackConfigured()) return false
  try {
    return await postToSlack(`✅ Onboarding profile completed\n\n${signupLines(item)}`)
  } catch (e) {
    console.error("[admin-notify] profile-completed slack failed", e)
    return false
  }
}
