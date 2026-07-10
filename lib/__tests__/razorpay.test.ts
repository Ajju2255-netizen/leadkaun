import { describe, it, expect, beforeAll } from "vitest"
import { createHmac } from "node:crypto"
import { verifyCheckoutSignature, verifyWebhookSignature, mapStatus } from "@/lib/billing/razorpay"

const KEY_SECRET = "test_key_secret_abc123"
const WEBHOOK_SECRET = "test_webhook_secret_xyz789"

beforeAll(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_fake"
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET
})

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("hex")

describe("verifyCheckoutSignature", () => {
  const paymentId = "pay_ABC123"
  const subscriptionId = "sub_XYZ789"

  it("accepts a signature over `payment_id|subscription_id`", () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(verifyCheckoutSignature({ paymentId, subscriptionId, signature })).toBe(true)
  })

  it("rejects the Orders-flow ordering (`subscription_id|payment_id`)", () => {
    // The single easiest way to get this wrong. Orders sign order_id|payment_id;
    // Subscriptions sign payment_id|subscription_id.
    const signature = sign(`${subscriptionId}|${paymentId}`, KEY_SECRET)
    expect(verifyCheckoutSignature({ paymentId, subscriptionId, signature })).toBe(false)
  })

  it("rejects a signature made with the wrong secret", () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, "not_the_secret")
    expect(verifyCheckoutSignature({ paymentId, subscriptionId, signature })).toBe(false)
  })

  it("rejects a tampered payment id", () => {
    const signature = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET)
    expect(verifyCheckoutSignature({ paymentId: "pay_EVIL", subscriptionId, signature })).toBe(false)
  })

  it("rejects garbage and empty signatures without throwing", () => {
    expect(verifyCheckoutSignature({ paymentId, subscriptionId, signature: "" })).toBe(false)
    expect(verifyCheckoutSignature({ paymentId, subscriptionId, signature: "zzzz" })).toBe(false)
    // A valid-hex but wrong-length digest must not blow up timingSafeEqual.
    expect(verifyCheckoutSignature({ paymentId, subscriptionId, signature: "abcd" })).toBe(false)
  })
})

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event: "subscription.charged", payload: {} })

  it("accepts a signature over the exact raw body", () => {
    expect(verifyWebhookSignature(body, sign(body, WEBHOOK_SECRET))).toBe(true)
  })

  it("rejects when the body is re-serialised differently", () => {
    // Guards the "verify before JSON.parse" rule: whitespace changes the digest.
    const reserialised = JSON.stringify(JSON.parse(body), null, 2)
    expect(verifyWebhookSignature(reserialised, sign(body, WEBHOOK_SECRET))).toBe(false)
  })

  it("rejects a signature made with the key secret instead of the webhook secret", () => {
    // These are different values in the Razorpay Dashboard, and confusing them
    // is a common misconfiguration.
    expect(verifyWebhookSignature(body, sign(body, KEY_SECRET))).toBe(false)
  })

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(body, null)).toBe(false)
  })

  it("rejects everything when no webhook secret is configured", () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    // Must fail closed, never open.
    expect(verifyWebhookSignature(body, sign(body, WEBHOOK_SECRET))).toBe(false)
    process.env.RAZORPAY_WEBHOOK_SECRET = saved
  })
})

describe("mapStatus", () => {
  it("keeps an authorised-but-unsettled subscription on trial", () => {
    // The mandate is approved but no money has moved. Going `active` here would
    // book MRR for a customer who has not paid.
    expect(mapStatus("created")).toBe("trialing")
    expect(mapStatus("authenticated")).toBe("trialing")
  })

  it("maps a settled subscription to active", () => {
    expect(mapStatus("active")).toBe("active")
  })

  it("maps failed renewals to past_due", () => {
    expect(mapStatus("pending")).toBe("past_due")
    expect(mapStatus("halted")).toBe("past_due")
  })

  it("maps terminal states to canceled", () => {
    expect(mapStatus("cancelled")).toBe("canceled")
    expect(mapStatus("completed")).toBe("canceled")
    expect(mapStatus("expired")).toBe("canceled")
  })

  it("falls back to trialing on an unknown status rather than granting access", () => {
    expect(mapStatus("some_new_status")).toBe("trialing")
  })
})
