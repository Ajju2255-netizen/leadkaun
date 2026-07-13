import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/billing/history
 * Payment + invoice history for the billing portal — one merged, newest-first
 * list the customer can scan and download from. Any authenticated role can view
 * their account's history.
 */
export async function GET() {
  try {
    const session = await requireAuth()
    const accountId = session.account.id

    const [payments, invoices] = await Promise.all([
      prisma.payment.findMany({
        where: { account_id: accountId },
        orderBy: { created_at: "desc" },
        take: 50,
        select: { id: true, amount_inr: true, status: true, provider_ref: true, created_at: true },
      }),
      prisma.invoice.findMany({
        where: { account_id: accountId },
        orderBy: { created_at: "desc" },
        take: 50,
        select: { id: true, number: true, amount_inr: true, status: true, pdf_url: true, provider_ref: true, created_at: true },
      }),
    ])

    // Merge into one timeline. An invoice is the downloadable receipt; a payment
    // without a matching invoice still shows (e.g. a failed/refunded charge).
    type Row = {
      id: string
      kind: "invoice" | "payment"
      amountInr: number
      status: string
      number: string | null
      /** true when this row can be downloaded (has an invoice with a doc). */
      downloadable: boolean
      at: Date
    }

    const rows: Row[] = [
      ...invoices.map((i) => ({
        id: i.id,
        kind: "invoice" as const,
        amountInr: i.amount_inr,
        status: i.status,
        number: i.number,
        // Downloadable if we stored a pdf, or it's a real Razorpay invoice we
        // can fetch the hosted URL for on demand.
        downloadable: Boolean(i.pdf_url) || Boolean(i.provider_ref),
        at: i.created_at,
      })),
      ...payments
        // A succeeded payment usually has a matching invoice row already; keep
        // failed/refunded ones visible (no invoice) so the history is complete.
        .filter((p) => p.status !== "succeeded")
        .map((p) => ({
          id: p.id,
          kind: "payment" as const,
          amountInr: p.amount_inr,
          status: p.status,
          number: null,
          downloadable: false,
          at: p.created_at,
        })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime())

    return apiSuccess({ history: rows })
  } catch (err) {
    return handleAuthError(err) ?? apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
