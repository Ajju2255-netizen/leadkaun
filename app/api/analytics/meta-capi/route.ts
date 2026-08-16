import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"

import { META_PIXEL_ID } from "@/lib/analytics/meta-pixel"

/**
 * Meta Conversions API — the server-side half of CompleteRegistration.
 *
 * Why this exists: the browser pixel is lossy by design. uBlock, Brave,
 * Firefox strict mode and Safari ITP all stop connect.facebook.net from
 * loading, `window.fbq` never exists, and the conversion is silently missed.
 * Typical loss is 10–30%, which matters a lot when a campaign is optimising
 * spend against this exact event.
 *
 * This route is first-party (app.leadkaun.com), so blockers do not touch it.
 * It posts the same event server-to-server. Meta de-duplicates the pair using
 * a shared `event_id`, so a user whose pixel DID load is still counted once.
 *
 * No-ops without META_CAPI_ACCESS_TOKEN, so it is safe to deploy before the
 * token exists.
 */

const GRAPH_VERSION = "v21.0"

/** Meta requires SHA-256 of the trimmed, lowercased value. */
function hash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

export async function POST(req: Request) {
  const token = process.env.META_CAPI_ACCESS_TOKEN
  // Not configured yet — succeed quietly; the browser pixel still covers most users.
  if (!token) return NextResponse.json({ ok: true, sent: false, reason: "no-token" })

  let body: { eventId?: string; email?: string; sourceUrl?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 })
  }

  const { eventId, email, sourceUrl } = body
  if (!eventId) return NextResponse.json({ ok: false, error: "missing-event-id" }, { status: 400 })

  const cookieStore = await cookies()
  const hdrs = await headers()

  // _fbp / _fbc are what tie this conversion back to the ad click. They are set
  // on the root domain by the pixel on leadkaun.com, so they are readable here.
  const fbp = cookieStore.get("_fbp")?.value
  const fbc = cookieStore.get("_fbc")?.value

  const payload = {
    data: [
      {
        event_name: "CompleteRegistration",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId, // dedupes against the browser pixel event
        action_source: "website",
        ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
        user_data: {
          ...(email ? { em: [hash(email)] } : {}),
          ...(fbp ? { fbp } : {}),
          ...(fbc ? { fbc } : {}),
          client_ip_address:
            hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
          client_user_agent: hdrs.get("user-agent") ?? undefined,
        },
      },
    ],
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Never hold up the signup UI on Meta's API.
        signal: AbortSignal.timeout(3000),
      },
    )
    if (!res.ok) {
      // Log the status only — the body can echo user data back.
      console.error("Meta CAPI rejected the event:", res.status)
      return NextResponse.json({ ok: false, sent: false }, { status: 200 })
    }
    return NextResponse.json({ ok: true, sent: true })
  } catch (err) {
    console.error("Meta CAPI request failed:", err instanceof Error ? err.name : "unknown")
    return NextResponse.json({ ok: false, sent: false }, { status: 200 })
  }
}
