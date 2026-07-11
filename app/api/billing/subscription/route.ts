import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { recordAccountEvent } from "@/lib/events/account-events"
import { getSeatUsage, seatsExceedPlan } from "@/lib/billing/seats"
import * as rzp from "@/lib/billing/razorpay"

// Checkout is an ADMIN-only action — a REP must not be able to put the account
// on a paid plan. Reads are allowed for anyone so the UI can show current state.
const CreateSchema = z.object({
  planKey: z.enum(["starter", "growth", "scale"]),
})

/**
 * GET /api/billing/subscription
 * Current plan + status for the signed-in account, plus the sellable plans.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    const [sub, plans, seats] = await Promise.all([
      prisma.subscription.findUnique({
        where: { account_id: session.account.id },
        include: { plan: { select: { key: true, name: true } } },
      }),
      prisma.plan.findMany({
        where: { is_active: true, key: { not: "trial" } },
        orderBy: { price_inr: "asc" },
        select: { key: true, name: true, price_inr: true, provider_plan_id: true, max_seats: true },
      }),
      getSeatUsage(session.account.id),
    ])

    return apiSuccess({
      configured: rzp.isConfigured(),
      subscription: sub && {
        planKey: sub.plan.key,
        planName: sub.plan.name,
        status: sub.status,
        mrrInr: sub.mrr_inr,
        trialEndsAt: sub.trial_ends_at,
        provider: sub.provider,
      },
      seats,
      // `sellable` is false until scripts/razorpay-sync-plans.ts has run — the
      // UI disables the button rather than failing at checkout.
      // `tooSmall` marks a plan the current team would not fit on.
      plans: plans.map((p) => ({
        key: p.key,
        name: p.name,
        priceInr: p.price_inr,
        maxSeats: p.max_seats,
        sellable: Boolean(p.provider_plan_id),
        tooSmall: seats.used > p.max_seats,
      })),
    })
  } catch (err) {
    return handleAuthError(err) ?? apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

/**
 * POST /api/billing/subscription
 * Creates a Razorpay subscription and returns the id for Checkout to open.
 *
 * We deliberately do NOT mark the account active here. The customer has only
 * been handed a payment intent; nothing is paid. `subscription.activated` /
 * `.charged` on the webhook is the single source of truth for going active.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`billing:subscribe:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const { data, error } = await parseBody(req, CreateSchema)
    if (error) return error

    const plan = await prisma.plan.findUnique({ where: { key: data.planKey } })
    if (!plan || !plan.is_active) return apiError("Unknown plan", "BAD_PLAN", 422)
    if (!plan.provider_plan_id) {
      return apiError(
        "This plan is not available for online payment yet",
        "PLAN_NOT_SYNCED",
        409,
      )
    }

    // Block a second checkout while one is already paid up. Downgrades/upgrades
    // between paid tiers need a cancel-then-resubscribe, which we don't do yet.
    const existing = await prisma.subscription.findUnique({
      where: { account_id: session.account.id },
    })
    if (existing?.status === "active") {
      return apiError(
        "This account already has an active subscription. Cancel it before switching plans.",
        "ALREADY_SUBSCRIBED",
        409,
      )
    }

    // Refuse to sell a plan the team does not fit on. Taking the money and then
    // leaving them permanently over-limit is the worst of both outcomes.
    const fit = await seatsExceedPlan(session.account.id, data.planKey)
    if (fit.exceeds) {
      return apiError(
        `${plan.name} includes ${fit.limit} seats but this account has ${fit.used} members. Remove members or choose a larger plan.`,
        "SEATS_EXCEED_PLAN",
        409,
      )
    }

    // Reuse the Razorpay customer across upgrades so saved methods carry over.
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: session.account.id },
      select: { id: true, name: true, razorpay_customer_id: true },
    })

    let customerId = account.razorpay_customer_id
    if (!customerId) {
      const customer = await rzp.createCustomer({
        name: account.name,
        email: session.user.email,
      })
      customerId = customer.id
      await prisma.account.update({
        where: { id: account.id },
        data: { razorpay_customer_id: customerId },
      })
    }

    const subscription = await rzp.createSubscription({
      planId: plan.provider_plan_id,
      customerId,
      accountId: account.id,
    })

    // Record the pending provider id now so a webhook that races ahead of the
    // browser's success handler can still find this account.
    await prisma.subscription.upsert({
      where: { account_id: account.id },
      create: {
        account_id: account.id,
        plan_id: plan.id,
        status: "trialing",
        mrr_inr: 0,
        provider: "razorpay",
        provider_subscription_id: subscription.id,
      },
      update: {
        plan_id: plan.id,
        provider: "razorpay",
        provider_subscription_id: subscription.id,
      },
    })

    return apiSuccess({
      subscriptionId: subscription.id,
      keyId: rzp.publicKeyId(),
      planName: plan.name,
      amountInr: plan.price_inr,
      accountName: account.name,
      email: session.user.email,
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    if (err instanceof rzp.RazorpayError) {
      console.error("[billing] Razorpay create-subscription failed:", err.code, err.message)
      return apiError("Could not start checkout. Please try again.", "PROVIDER_ERROR", 502)
    }
    console.error("[billing] create-subscription failed:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

/**
 * DELETE /api/billing/subscription
 * Cancel at period end — the customer keeps access through what they paid for.
 * The `subscription.cancelled` webhook flips our status when Razorpay confirms.
 */
export async function DELETE() {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`billing:cancel:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const sub = await prisma.subscription.findUnique({
      where: { account_id: session.account.id },
    })
    if (!sub?.provider_subscription_id || sub.provider !== "razorpay") {
      return apiError("No cancellable subscription for this account", "NOT_FOUND", 404)
    }
    if (sub.status === "canceled") {
      return apiError("This subscription is already cancelled", "ALREADY_CANCELED", 409)
    }

    await rzp.cancelSubscription(sub.provider_subscription_id, true)

    await recordAccountEvent({
      accountId: session.account.id,
      actorUserId: session.user.id,
      type: "PLAN_CHANGED",
      summary: `Cancellation scheduled at period end by ${session.user.email}`,
      detail: { provider: "razorpay", subscriptionId: sub.provider_subscription_id },
    })

    // Status stays as-is until Razorpay confirms via webhook.
    return apiSuccess({ ok: true, cancelAtCycleEnd: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    if (err instanceof rzp.RazorpayError) {
      console.error("[billing] Razorpay cancel failed:", err.code, err.message)
      return apiError("Could not cancel the subscription. Please try again.", "PROVIDER_ERROR", 502)
    }
    console.error("[billing] cancel failed:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
