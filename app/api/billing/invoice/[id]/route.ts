import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiError } from "@/lib/api/response"
import { prisma } from "@/lib/prisma"
import { renderInvoicePdf } from "@/lib/billing/invoice-pdf"
import { INVOICE_ISSUER } from "@/lib/billing/invoice-issuer"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/billing/invoice/[id] — download the Leadkaun-branded invoice PDF.
 *
 * We generate our own document from the Invoice + Account records; Razorpay's
 * hosted invoice stays on the record (provider_ref) for audit but is no longer
 * what the customer downloads. Scoped to the caller's account so one tenant
 * can't pull another's invoice.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    const { id } = await params

    const invoice = await prisma.invoice.findFirst({
      where: { id, account_id: session.account.id },
      select: {
        id: true, number: true, amount_inr: true, status: true,
        period_start: true, period_end: true, provider_ref: true, created_at: true,
      },
    })
    if (!invoice) return apiError("Invoice not found", "NOT_FOUND", 404)

    const [account, sub] = await Promise.all([
      prisma.account.findUniqueOrThrow({
        where: { id: session.account.id },
        select: { name: true, city: true, state: true },
      }),
      prisma.subscription.findUnique({
        where: { account_id: session.account.id },
        select: { billing_cycle: true, plan: { select: { name: true } } },
      }),
    ])

    // Backfilled invoices carry a serial; fall back to a stable id-derived label
    // for any legacy row that somehow lacks one.
    const number = invoice.number ?? `${INVOICE_ISSUER.numberPrefix}-${invoice.id.slice(-6).toUpperCase()}`
    const location = [account.city, account.state].filter(Boolean).join(", ") || null

    const pdf = await renderInvoicePdf({
      number,
      issuedAt: invoice.created_at,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      amountPaise: invoice.amount_inr,
      status: invoice.status,
      // Invoices don't store the plan name yet; the current subscription is the
      // best source. Falls back gracefully for cancelled/legacy accounts.
      planName: sub?.plan?.name ?? "Subscription",
      billingCycle: sub?.billing_cycle ?? "monthly",
      customer: { name: account.name, location, email: session.user.email },
      paymentRef: invoice.provider_ref,
    })

    const filename = `Leadkaun-Invoice-${number}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-")
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("[billing/invoice] render failed:", err)
    return apiError("Could not generate the invoice. Please try again.", "INTERNAL_ERROR", 500)
  }
}
