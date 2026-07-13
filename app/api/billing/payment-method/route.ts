import { prisma } from "@/lib/prisma"
import { requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import * as rzp from "@/lib/billing/razorpay"

/**
 * POST /api/billing/payment-method — start a payment-method (card) update.
 *
 * Razorpay has NO API to swap the card on an existing subscription, so we
 * re-authorise: create a NEW subscription on the SAME plan, hand it to Checkout
 * for the customer to enter a new card, and record its id in
 * `pending_provider_subscription_id`. When it activates, the webhook cancels the
 * OLD subscription at cycle end (so no lost time / no double charge) and swaps
 * the new id into `provider_subscription_id`. See app/api/billing/webhook.
 *
 * ⚠️ UNVERIFIED against live Razorpay — the create/activate/cancel round-trip
 * needs a real-keys dry run before launch. The DB-side swap logic IS tested.
 *
 * ADMIN only. Only valid for an existing card (Razorpay) subscription; Razorpay
 * subscription updates are card-only, which matches our card-only checkout.
 */
export async function POST() {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`billing:paymethod:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const sub = await prisma.subscription.findUnique({
      where: { account_id: session.account.id },
      include: { plan: true },
    })
    if (!sub?.provider_subscription_id || sub.provider !== "razorpay") {
      return apiError("No card subscription to update on this account", "NO_SUBSCRIPTION", 404)
    }
    // Only active/past_due subscriptions can be re-authorised; a canceled one
    // should just resubscribe through the normal plan picker.
    if (sub.status !== "active" && sub.status !== "past_due") {
      return apiError("This subscription can't be updated. Resubscribe instead.", "NOT_UPDATABLE", 409)
    }
    if (!sub.plan.provider_plan_id) {
      return apiError("This plan is not available for online payment", "PLAN_NOT_SYNCED", 409)
    }

    const account = await prisma.account.findUniqueOrThrow({
      where: { id: session.account.id },
      select: { id: true, name: true, razorpay_customer_id: true },
    })

    let customerId = account.razorpay_customer_id
    if (!customerId) {
      const customer = await rzp.createCustomer({ name: account.name, email: session.user.email })
      customerId = customer.id
      await prisma.account.update({ where: { id: account.id }, data: { razorpay_customer_id: customerId } })
    }

    // New subscription on the same plan — this is the re-authorisation.
    const replacement = await rzp.createSubscription({
      planId: sub.plan.provider_plan_id,
      customerId,
      accountId: account.id,
    })

    // Track it as pending. The OLD subscription keeps billing until the new one
    // activates and the webhook cancels it at cycle end — never both charging.
    await prisma.subscription.update({
      where: { account_id: account.id },
      data: { pending_provider_subscription_id: replacement.id },
    })

    return apiSuccess({
      subscriptionId: replacement.id,
      keyId: rzp.publicKeyId(),
      planName: sub.plan.name,
      amountInr: sub.plan.price_inr,
      accountName: account.name,
      email: session.user.email,
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    if (err instanceof rzp.RazorpayError) {
      console.error("[billing] payment-method update failed:", err.code, err.message)
      return apiError("Could not start the update. Please try again.", "PROVIDER_ERROR", 502)
    }
    console.error("[billing] payment-method update failed:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
