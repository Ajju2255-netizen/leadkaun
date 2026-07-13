import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Minimal Razorpay REST client. We call the four endpoints we need over `fetch`
 * rather than pulling in the `razorpay` SDK — it drags in a request stack we
 * don't want in a serverless bundle, and the signature helpers are three lines
 * of node:crypto.
 *
 * Amounts are ALWAYS paise (integer). Razorpay speaks paise; so does our `plans`
 * table (`price_inr` is paise despite the name). Never divide before sending.
 *
 * Env:
 *   RAZORPAY_KEY_ID         — public-ish, also handed to the browser checkout
 *   RAZORPAY_KEY_SECRET     — server only, never leaves this module
 *   RAZORPAY_WEBHOOK_SECRET — server only, set when creating the webhook in the
 *                             Razorpay Dashboard (it is NOT the key secret)
 */

const API = "https://api.razorpay.com/v1"

// ─────────────────────────────────────────────
// Credentials — read lazily so importing this module never throws.
// lib/env.ts leaves these optional (dev machines have no Razorpay), and we fail
// loudly at call time instead of breaking `next dev` for everyone.
// ─────────────────────────────────────────────

function creds() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    throw new RazorpayError(
      "Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET",
      500,
    )
  }
  return { keyId, keySecret }
}

/** The publishable key id, for handing to Razorpay Checkout in the browser. */
export function publicKeyId(): string {
  return creds().keyId
}

export function isConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = "RazorpayError"
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { keyId, keySecret } = creds()
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")

  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    // Never let a Razorpay response land in Next's data cache.
    cache: "no-store",
  })

  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { description?: string; code?: string } })
    | null

  if (!res.ok) {
    // Razorpay errors look like { error: { code, description, ... } }
    throw new RazorpayError(
      json?.error?.description ?? `Razorpay ${init?.method ?? "GET"} ${path} failed (${res.status})`,
      res.status,
      json?.error?.code,
    )
  }
  if (!json) throw new RazorpayError(`Razorpay returned a non-JSON body for ${path}`, 502)
  return json
}

// ─────────────────────────────────────────────
// Entities (only the fields we actually read)
// ─────────────────────────────────────────────

export type RzpPlan = { id: string; item: { name: string; amount: number; currency: string } }
export type RzpCustomer = { id: string; email: string }
export type RzpSubscription = {
  id: string
  plan_id: string
  status: string // created | authenticated | active | pending | halted | cancelled | completed
  current_start: number | null
  current_end: number | null
  notes?: Record<string, string>
}

/** Create a monthly Razorpay Plan. `amountPaise` must be an integer. */
export function createPlan(input: { name: string; amountPaise: number }) {
  return call<RzpPlan>("/plans", {
    method: "POST",
    body: {
      period: "monthly",
      interval: 1,
      item: { name: input.name, amount: input.amountPaise, currency: "INR" },
    },
  })
}

export function createCustomer(input: { name: string; email: string; contact?: string }) {
  return call<RzpCustomer>("/customers", {
    method: "POST",
    body: {
      name: input.name,
      email: input.email,
      contact: input.contact,
      // Reuse rather than 409 if this email already exists on the account.
      fail_existing: "0",
    },
  })
}

/**
 * Create a subscription against a Razorpay Plan.
 *
 * `totalCount` is the number of billing cycles Razorpay will attempt. Razorpay
 * has no true "until cancelled" — 120 monthly cycles is 10 years, which is the
 * conventional stand-in. The customer can cancel at any time.
 */
export function createSubscription(input: {
  planId: string
  customerId: string
  accountId: string
  totalCount?: number
}) {
  return call<RzpSubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: input.planId,
      customer_id: input.customerId,
      total_count: input.totalCount ?? 120,
      customer_notify: 1,
      // Echoed back on every webhook — this is how we map a Razorpay
      // subscription to one of our accounts without trusting the client.
      notes: { account_id: input.accountId },
    },
  })
}

export function fetchSubscription(subscriptionId: string) {
  return call<RzpSubscription>(`/subscriptions/${subscriptionId}`)
}

export type RzpInvoice = { id: string; short_url: string | null; invoice_number: string | null; status: string }

/** Fetch an invoice — `short_url` is Razorpay's hosted/downloadable invoice. */
export function fetchInvoice(invoiceId: string) {
  return call<RzpInvoice>(`/invoices/${invoiceId}`)
}

/** Cancel at the end of the paid period so the customer keeps what they bought. */
export function cancelSubscription(subscriptionId: string, atCycleEnd = true) {
  return call<RzpSubscription>(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 },
  })
}

// ─────────────────────────────────────────────
// Signature verification
// ─────────────────────────────────────────────

/** Constant-time compare of two hex digests. Length-safe. */
function hexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex")
  const bufB = Buffer.from(b, "hex")
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verify the signature Razorpay Checkout hands back in its success handler.
 *
 * For SUBSCRIPTIONS the signed payload is `payment_id|subscription_id` — note
 * the order is the reverse of the Orders flow (`order_id|payment_id`). Getting
 * this backwards silently rejects every real payment.
 */
export function verifyCheckoutSignature(input: {
  paymentId: string
  subscriptionId: string
  signature: string
}): boolean {
  const { keySecret } = creds()
  const expected = createHmac("sha256", keySecret)
    .update(`${input.paymentId}|${input.subscriptionId}`)
    .digest("hex")
  return hexEqual(expected, input.signature)
}

/**
 * Verify a webhook delivery. Signed over the EXACT raw request body — parse the
 * JSON only after this returns true, never before, or a mismatched
 * re-serialisation will fail the check.
 *
 * Signed with RAZORPAY_WEBHOOK_SECRET (set in the Dashboard when you add the
 * webhook), which is a different value from RAZORPAY_KEY_SECRET.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  return hexEqual(expected, signature)
}

// ─────────────────────────────────────────────
// Status mapping
// ─────────────────────────────────────────────

/**
 * Razorpay subscription status → our `subscriptions.status` vocabulary
 * (trialing | active | past_due | canceled).
 *
 *   created/authenticated — mandate approved, first charge not settled yet.
 *     The account is still on its trial, so we leave it `trialing` and only
 *     flip to `active` on subscription.activated / .charged.
 *   pending/halted — a renewal failed; Razorpay is retrying (pending) or has
 *     given up (halted). Both are "they owe us money" → past_due.
 *   completed — ran out its total_count. Treated as canceled: no more charges.
 */
export function mapStatus(rzpStatus: string): "trialing" | "active" | "past_due" | "canceled" {
  switch (rzpStatus) {
    case "active":
      return "active"
    case "pending":
    case "halted":
      return "past_due"
    case "cancelled":
    case "completed":
    case "expired":
      return "canceled"
    case "created":
    case "authenticated":
    default:
      return "trialing"
  }
}
