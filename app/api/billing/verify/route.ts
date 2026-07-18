import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import * as rzp from "@/lib/billing/razorpay"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

const VerifySchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
})

/**
 * POST /api/billing/verify
 *
 * Called from Razorpay Checkout's success handler so the UI can flip to "active"
 * without waiting on the webhook (which can lag by seconds).
 *
 * This is a convenience path, not the source of truth. Two things keep it safe:
 *
 *  1. The HMAC signature proves the payload came from Razorpay, not the browser.
 *  2. We then ask Razorpay directly what the subscription's status is, rather
 *     than believing any status the client sent. The client cannot influence
 *     what we write.
 *
 * The webhook still runs and reconciles. If this route never fires (user closed
 * the tab), the webhook alone gets the account to the right state.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`billing:verify:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const { data, error } = await parseBody(req, VerifySchema)
    if (error) return error

    if (
      !rzp.verifyCheckoutSignature({
        paymentId: data.razorpay_payment_id,
        subscriptionId: data.razorpay_subscription_id,
        signature: data.razorpay_signature,
      })
    ) {
      console.warn("[billing] bad checkout signature for account", session.account.id)
      return apiError("Payment could not be verified", "BAD_SIGNATURE", 400)
    }

    // The signature proves Razorpay signed this pair. It does NOT prove the
    // subscription belongs to the caller's account — check that ourselves before
    // touching any row.
    const sub = await prisma.subscription.findUnique({
      where: { account_id: session.account.id },
      include: { plan: true },
    })
    // The id may be the account's active subscription OR a pending replacement
    // from an "update payment method" re-authorisation.
    const isPending = sub?.pending_provider_subscription_id === data.razorpay_subscription_id
    const owns = sub && (sub.provider_subscription_id === data.razorpay_subscription_id || isPending)
    if (!sub || !owns) {
      console.warn(
        "[billing] verify for a subscription this account does not own:",
        session.account.id,
        data.razorpay_subscription_id,
      )
      return apiError("Payment could not be verified", "BAD_SIGNATURE", 400)
    }

    // Ask Razorpay, don't trust the browser.
    const remote = await rzp.fetchSubscription(data.razorpay_subscription_id)
    const status = rzp.mapStatus(remote.status)

    if (!isPending) {
      await prisma.subscription.update({
        where: { account_id: session.account.id },
        data: {
          status,
          mrr_inr: status === "active" ? sub.plan.price_inr : sub.mrr_inr,
          canceled_at: status === "canceled" ? new Date() : null,
        },
      })
    } else if (remote.status === "authenticated" || status === "active") {
      // Payment-method re-auth succeeded: swap the card over now via this browser
      // success path rather than waiting on the webhook — for a future-dated sub
      // Razorpay won't fire subscription.activated until the deferred first charge,
      // and subscription.authenticated may not be enabled on the webhook. Cancel
      // the old sub at cycle end and adopt the new id. Idempotent with the
      // webhook's swap — a second run finds pending already cleared.
      const oldSubId = sub.provider_subscription_id
      if (oldSubId && oldSubId !== data.razorpay_subscription_id) {
        try {
          await rzp.cancelSubscription(oldSubId, true)
        } catch (e) {
          console.error("[billing] verify swap: old sub cancel failed —", oldSubId, e)
        }
      }
      await prisma.subscription.update({
        where: { account_id: session.account.id },
        data: {
          provider_subscription_id: data.razorpay_subscription_id,
          pending_provider_subscription_id: null,
          status: "active",
          mrr_inr: sub.plan.price_inr,
          ...(remote.current_start
            ? { current_period_start: new Date(remote.current_start * 1000), current_period_end: remote.current_end ? new Date(remote.current_end * 1000) : null }
            : {}),
        },
      })
    }

    // Payment/Invoice rows are written by the webhook only — it carries the
    // authoritative amount and invoice id. Writing them here too would risk a
    // duplicate that the unique index would then reject on the webhook side.
    return apiSuccess({ status, paymentMethodUpdate: isPending })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    if (err instanceof rzp.RazorpayError) {
      console.error("[billing] verify: Razorpay lookup failed:", err.code, err.message)
      return apiError("Could not confirm the payment. It may still complete.", "PROVIDER_ERROR", 502)
    }
    console.error("[billing] verify failed:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
