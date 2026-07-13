import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { recordAccountEvent } from "@/lib/events/account-events"
import * as rzp from "@/lib/billing/razorpay"

// node:crypto + raw body — must not run on the edge.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/billing/webhook — Razorpay subscription events.
 *
 * This is the source of truth for billing state. The browser's success handler
 * (/api/billing/verify) is a UX shortcut; if it never fires, this route alone
 * still gets the account to the right place.
 *
 * Unauthenticated by design — the HMAC signature is the auth. `/api/*` is
 * excluded from middleware's matcher, so nothing else gates this path.
 *
 * Contract with Razorpay:
 *   • Delivery is at-least-once; retries continue for ~24h on any non-2xx.
 *   • Therefore: 2xx means "I will never need this again". We return 200 even
 *     for events we ignore or cannot map, and reserve 5xx for genuinely
 *     transient failures we want redelivered.
 */

/**
 * Subscription-domain events only. Every one of these carries a `subscription`
 * entity, which is what lets us map the event back to an account.
 *
 * `payment.failed` is deliberately NOT here: it is a payments-domain event whose
 * payload contains only a payment entity — no subscription — so it cannot be
 * attributed to an account. A failed *renewal* surfaces to us as
 * `subscription.pending` (Razorpay is retrying) and then `subscription.halted`
 * (it gave up), both of which do carry the subscription.
 * See https://razorpay.com/docs/webhooks/payloads/subscriptions/
 */
const RELEVANT = new Set([
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
])

/** Razorpay sends a payment entity on any event preceded by a payment attempt. */
type RzpWebhook = {
  event: string
  payload: {
    subscription?: { entity: { id: string; status: string; notes?: Record<string, string>; current_start: number | null; current_end: number | null } }
    payment?: { entity: { id: string; amount: number; status: string; invoice_id?: string | null; error_description?: string | null } }
    refund?: { entity: { id: string; payment_id: string; amount: number; status: string } }
  }
}

/** Refund events are payments-domain (no subscription entity) — handled apart. */
const REFUND_EVENTS = new Set(["refund.created", "refund.processed"])

const unix = (s: number | null | undefined) => (s ? new Date(s * 1000) : null)

export async function POST(req: Request) {
  // The signature covers the exact bytes Razorpay sent. Read the body as text
  // and verify BEFORE parsing — re-serialising parsed JSON would not match.
  const raw = await req.text()
  const signature = req.headers.get("x-razorpay-signature")

  if (!rzp.verifyWebhookSignature(raw, signature)) {
    console.warn("[billing/webhook] rejected: bad or missing signature")
    return new Response("Invalid signature", { status: 401 })
  }

  const eventId = req.headers.get("x-razorpay-event-id")
  if (!eventId) {
    console.warn("[billing/webhook] rejected: missing x-razorpay-event-id")
    return new Response("Missing event id", { status: 400 })
  }

  let body: RzpWebhook
  try {
    body = JSON.parse(raw) as RzpWebhook
  } catch {
    // Signed but unparseable — retrying won't help.
    console.error("[billing/webhook] signed body was not valid JSON")
    return new Response("ok", { status: 200 })
  }

  // Refunds carry a refund entity (a payment_id), not a subscription — handle
  // them before the subscription-entity requirement below. Idempotent via the
  // same webhook_events claim; marks the matching payment refunded.
  if (REFUND_EVENTS.has(body.event)) {
    const refund = body.payload.refund?.entity
    if (!refund?.payment_id) return Response.json({ ok: true, ignored: `${body.event} (no payment)` })
    try {
      await prisma.$transaction(async (tx) => {
        await tx.webhookEvent.create({
          data: { provider: "razorpay", event_id: eventId, event_type: body.event },
        })
        // (provider, provider_ref) is unique → at most one row; updateMany just
        // avoids throwing when the payment isn't one we recorded.
        await tx.payment.updateMany({
          where: { provider: "razorpay", provider_ref: refund.payment_id },
          data: { status: "refunded" },
        })
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return Response.json({ ok: true, duplicate: eventId })
      }
      console.error("[billing/webhook] refund processing failed for", eventId, err)
      return new Response("Processing failed", { status: 500 })
    }
    return Response.json({ ok: true, event: body.event, paymentRef: refund.payment_id })
  }

  if (!RELEVANT.has(body.event)) {
    return Response.json({ ok: true, ignored: body.event })
  }

  const subEntity = body.payload.subscription?.entity
  const payEntity = body.payload.payment?.entity

  // Every event in RELEVANT is documented to carry this. If it's absent the
  // payload is malformed; a retry would be identical, so ack and move on.
  if (!subEntity) {
    console.error("[billing/webhook] no subscription entity on", body.event)
    return Response.json({ ok: true, ignored: `${body.event} (no subscription)` })
  }

  // Map provider → account. `notes.account_id` is what we stamped at creation;
  // fall back to our own record in case an older subscription lacks notes.
  const local = await prisma.subscription.findFirst({
    where: { provider_subscription_id: subEntity.id },
    include: { plan: true },
  })
  const accountId = local?.account_id ?? subEntity.notes?.account_id

  if (!local || !accountId) {
    // Nothing to update. A retry would find the same nothing, so ack it.
    console.error("[billing/webhook] no local subscription for", subEntity.id, body.event)
    return Response.json({ ok: true, unmatched: subEntity.id })
  }

  const status = rzp.mapStatus(subEntity.status)
  // A payment entity rides along with `subscription.charged` and also with
  // `subscription.completed` (the final cycle's charge). Key off the entity
  // rather than the event name so both are recorded, and let the unique index
  // collapse the overlap if the same payment arrives on two events.
  const captured = payEntity?.status === "captured" ? payEntity : null
  // Razorpay retried a renewal and it did not settle (pending), or it has
  // stopped retrying altogether (halted).
  const renewalFailed = body.event === "subscription.pending" || body.event === "subscription.halted"

  // True only when THIS delivery was the one that created the payment row, so
  // the timeline gets one entry per payment rather than one per event carrying
  // it. (`subscription.charged` and `subscription.completed` can both carry the
  // same final-cycle payment under different event ids.)
  let paymentInserted = false

  try {
    // One transaction: claim the event id, then write. If anything below throws,
    // the claim rolls back too and Razorpay's retry gets a clean attempt. If a
    // duplicate delivery races us, the unique index on (provider, event_id)
    // aborts it here — before it can double-write a payment.
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: { provider: "razorpay", event_id: eventId, event_type: body.event },
      })

      await tx.subscription.update({
        where: { account_id: accountId },
        data: {
          status,
          // Only a settled charge establishes real MRR. Leave the previous value
          // alone on halted/pending so revenue doesn't silently drop to zero
          // while Razorpay is still retrying the customer's card.
          ...(status === "active" ? { mrr_inr: local.plan.price_inr } : {}),
          canceled_at: status === "canceled" ? new Date() : null,
          // Track the current paid period (for the renewal date). Only set when
          // Razorpay sends it, so an event without bounds doesn't wipe them.
          ...(subEntity.current_start
            ? { current_period_start: unix(subEntity.current_start), current_period_end: unix(subEntity.current_end) }
            : {}),
        },
      })

      if (captured) {
        const already = await tx.payment.findUnique({
          where: { provider_provider_ref: { provider: "razorpay", provider_ref: captured.id } },
          select: { id: true },
        })
        paymentInserted = !already

        await tx.payment.upsert({
          where: { provider_provider_ref: { provider: "razorpay", provider_ref: captured.id } },
          create: {
            account_id: accountId,
            amount_inr: captured.amount,
            status: "succeeded",
            provider: "razorpay",
            provider_ref: captured.id,
          },
          update: {}, // already recorded — a retry must not change anything
        })

        if (captured.invoice_id) {
          await tx.invoice.upsert({
            where: { provider_provider_ref: { provider: "razorpay", provider_ref: captured.invoice_id } },
            create: {
              account_id: accountId,
              amount_inr: captured.amount,
              status: "paid",
              period_start: unix(subEntity.current_start),
              period_end: unix(subEntity.current_end),
              provider: "razorpay",
              provider_ref: captured.invoice_id,
            },
            update: {},
          })
        }
      }
    })
  } catch (err) {
    // Duplicate delivery: we already processed this exact event id. Ack it so
    // Razorpay stops retrying.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return Response.json({ ok: true, duplicate: eventId })
    }
    // Anything else is likely transient (DB blip). 5xx → Razorpay redelivers.
    console.error("[billing/webhook] processing failed for", body.event, eventId, err)
    return new Response("Processing failed", { status: 500 })
  }

  // Telemetry, after the money is durably recorded. Best-effort; never throws.
  // These are independent, not exclusive: `subscription.completed` both settles
  // a final payment and ends the subscription, and deserves both entries.
  if (captured && paymentInserted) {
    await recordAccountEvent({
      accountId,
      type: "PAYMENT_SUCCEEDED",
      summary: `Payment of ₹${(captured.amount / 100).toLocaleString("en-IN")} received for ${local.plan.name}`,
      detail: { provider: "razorpay", paymentId: captured.id, plan: local.plan.key },
    })
  }

  if (renewalFailed) {
    const halted = body.event === "subscription.halted"
    await recordAccountEvent({
      accountId,
      type: "PAYMENT_FAILED",
      summary: halted
        ? `${local.plan.name} renewal failed — Razorpay has stopped retrying`
        : `${local.plan.name} renewal did not go through — Razorpay is retrying`,
      detail: { provider: "razorpay", plan: local.plan.key, event: body.event },
    })
  } else if (body.event === "subscription.activated") {
    await recordAccountEvent({
      accountId,
      type: "PLAN_CHANGED",
      summary: `Subscribed to ${local.plan.name} via Razorpay`,
      detail: { provider: "razorpay", plan: local.plan.key },
    })
  } else if (body.event === "subscription.cancelled" || body.event === "subscription.completed") {
    await recordAccountEvent({
      accountId,
      type: "PLAN_CHANGED",
      summary: `${local.plan.name} subscription ended (${body.event.split(".")[1]})`,
      detail: { provider: "razorpay", plan: local.plan.key },
    })
  }

  return Response.json({ ok: true, event: body.event, status })
}
