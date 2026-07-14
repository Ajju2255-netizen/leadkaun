import { NextResponse } from "next/server"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiError } from "@/lib/api/response"
import { prisma } from "@/lib/prisma"
import * as rzp from "@/lib/billing/razorpay"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/billing/invoice/[id] — download an invoice.
 *
 * Redirects to the invoice document: the stored pdf_url if we have one, else
 * Razorpay's hosted invoice URL fetched on demand from provider_ref. Scoped to
 * the caller's account so one tenant can't pull another's invoice.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    const { id } = await params

    const invoice = await prisma.invoice.findFirst({
      where: { id, account_id: session.account.id },
      select: { pdf_url: true, provider: true, provider_ref: true },
    })
    if (!invoice) return apiError("Invoice not found", "NOT_FOUND", 404)

    if (invoice.pdf_url) {
      return NextResponse.redirect(invoice.pdf_url)
    }

    // No stored doc — fetch the hosted invoice URL from Razorpay on demand.
    if (invoice.provider === "razorpay" && invoice.provider_ref) {
      const remote = await rzp.fetchInvoice(invoice.provider_ref)
      if (remote.short_url) return NextResponse.redirect(remote.short_url)
    }

    return apiError("No downloadable document for this invoice yet", "NO_DOCUMENT", 404)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    if (err instanceof rzp.RazorpayError) {
      return apiError("Could not fetch the invoice. Please try again.", "PROVIDER_ERROR", 502)
    }
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
