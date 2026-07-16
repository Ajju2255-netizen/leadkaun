import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"
import { INVOICE_ISSUER } from "./invoice-issuer"

/**
 * Renders a branded Leadkaun invoice PDF from our own records — this is the
 * document customers download from the Billing page. Amounts are drawn as
 * "INR 7,999.00" (the standard Helvetica font has no ₹ glyph), and every dynamic
 * string is coerced to Latin-1 so a non-ASCII customer name can't crash the draw.
 */

const A4 = { w: 595.28, h: 841.89 }
const M = 50 // page margin
const RIGHT = A4.w - M

const C = {
  ink: rgb(0.059, 0.09, 0.165),
  muted: rgb(0.392, 0.455, 0.545),
  accent: rgb(0.02, 0.6, 0.86),
  line: rgb(0.886, 0.91, 0.941),
  soft: rgb(0.965, 0.976, 0.988),
  green: rgb(0.02, 0.53, 0.35),
  greenBg: rgb(0.86, 0.96, 0.91),
  amber: rgb(0.72, 0.53, 0.04),
  amberBg: rgb(0.99, 0.95, 0.83),
}

export type InvoiceData = {
  number: string
  issuedAt: Date
  periodStart: Date | null
  periodEnd: Date | null
  amountPaise: number
  status: string // paid | refunded | void
  planName: string
  billingCycle: string | null
  customer: { name: string; location?: string | null; email?: string | null }
  paymentRef?: string | null
}

// Standard Helvetica encodes WinAnsi (Latin-1) only. Replace ₹, drop anything
// outside the encodable range so drawText never throws on real-world names.
function ascii(s: string): string {
  return s
    .replace(/₹/g, "Rs ")
    .replace(/[‒-―]/g, "-") // various dashes → hyphen
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
}
function inr(paise: number): string {
  return "INR " + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: Date | null): string {
  if (!d) return "-"
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([A4.w, A4.h])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const text = (s: string, x: number, y: number, size: number, f: PDFFont, color = C.ink) =>
    page.drawText(ascii(s), { x, y, size, font: f, color })
  const textRight = (s: string, xr: number, y: number, size: number, f: PDFFont, color = C.ink) => {
    const t = ascii(s)
    page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y, size, font: f, color })
  }
  const rule = (y: number, x1 = M, x2 = RIGHT, thickness = 1, color = C.line) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })

  const isTax = INVOICE_ISSUER.gst.registered
  const title = isTax ? "TAX INVOICE" : "INVOICE"

  // ── Header ──────────────────────────────────────────────────────────────
  text(INVOICE_ISSUER.brand.toUpperCase(), M, 782, 22, bold, C.accent)
  text("Sales Behaviour OS", M, 767, 9, font, C.muted)
  textRight(title, RIGHT, 784, 18, bold, C.ink)
  textRight(`No.  ${data.number}`, RIGHT, 767, 10, font, C.muted)
  textRight(`Issued  ${fmtDate(data.issuedAt)}`, RIGHT, 753, 10, font, C.muted)
  rule(738, M, RIGHT, 2, C.accent)

  // ── From / Bill To ──────────────────────────────────────────────────────
  const col2 = M + (RIGHT - M) / 2 + 10
  text("FROM", M, 718, 8, bold, C.muted)
  text("BILL TO", col2, 718, 8, bold, C.muted)

  let ly = 702
  const fromLine = (s: string, f = font, size = 9, color = C.muted) => { text(s, M, ly, size, f, color); ly -= 12 }
  ly = 702; fromLine(INVOICE_ISSUER.legalName, bold, 11, C.ink); ly -= 3
  for (const line of INVOICE_ISSUER.addressLines) fromLine(line)
  if (INVOICE_ISSUER.email) fromLine(INVOICE_ISSUER.email)
  if (INVOICE_ISSUER.website) fromLine(INVOICE_ISSUER.website)
  if (isTax && INVOICE_ISSUER.gst.gstin) fromLine(`GSTIN: ${INVOICE_ISSUER.gst.gstin}`)

  let ry = 702
  const toLine = (s: string, f = font, size = 9, color = C.muted) => { text(s, col2, ry, size, f, color); ry -= 12 }
  ry = 702; toLine(data.customer.name, bold, 11, C.ink); ry -= 3
  if (data.customer.location) toLine(data.customer.location)
  if (data.customer.email) toLine(data.customer.email)

  // ── Line item ───────────────────────────────────────────────────────────
  const tTop = 636
  page.drawRectangle({ x: M, y: tTop - 22, width: RIGHT - M, height: 22, color: C.soft })
  text("DESCRIPTION", M + 10, tTop - 15, 8, bold, C.muted)
  textRight("AMOUNT", RIGHT - 10, tTop - 15, 8, bold, C.muted)

  const rowTop = tTop - 22
  const cycle = data.billingCycle === "annual" ? "annual" : "monthly"
  text(`${INVOICE_ISSUER.brand} — ${data.planName} plan (${cycle})`, M + 10, rowTop - 20, 10.5, bold, C.ink)
  const period = data.periodStart && data.periodEnd
    ? `Billing period: ${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}`
    : "Subscription charge"
  text(period, M + 10, rowTop - 34, 9, font, C.muted)
  textRight(inr(data.amountPaise), RIGHT - 10, rowTop - 20, 10.5, bold, C.ink)
  rule(rowTop - 46, M, RIGHT, 1, C.line)

  // ── Totals (+ GST breakup when registered) ─────────────────────────────
  let ty = rowTop - 66
  const labelX = RIGHT - 210
  if (isTax) {
    const rate = INVOICE_ISSUER.gst.rate
    const base = Math.round(data.amountPaise / (1 + rate / 100))
    const tax = data.amountPaise - base
    const half = Math.round(tax / 2)
    text("Taxable value", labelX, ty, 9.5, font, C.muted); textRight(inr(base), RIGHT, ty, 9.5, font, C.ink); ty -= 15
    text(`CGST ${rate / 2}%`, labelX, ty, 9.5, font, C.muted); textRight(inr(half), RIGHT, ty, 9.5, font, C.ink); ty -= 15
    text(`SGST ${rate / 2}%`, labelX, ty, 9.5, font, C.muted); textRight(inr(tax - half), RIGHT, ty, 9.5, font, C.ink); ty -= 18
  }
  rule(ty + 12, labelX, RIGHT, 1, C.line)
  text("Amount paid", labelX, ty, 10, font, C.muted)
  textRight(inr(data.amountPaise), RIGHT, ty, 13, bold, C.ink)

  // status pill, left-aligned to the total row
  const st = data.status.toUpperCase()
  const isPaid = st === "PAID"
  const pill = isPaid ? "PAID" : st
  const pw = bold.widthOfTextAtSize(pill, 9) + 16
  page.drawRectangle({ x: M, y: ty - 5, width: pw, height: 19, color: isPaid ? C.greenBg : C.amberBg })
  text(pill, M + 8, ty, 9, bold, isPaid ? C.green : C.amber)

  // ── Footer ─────────────────────────────────────────────────────────────
  rule(122)
  text("Payment method: Card · Razorpay", M, 106, 9, font, C.muted)
  if (data.paymentRef) text(`Reference: ${data.paymentRef}`, M, 93, 9, font, C.muted)
  text("This is a computer-generated invoice and is valid without a signature.", M, 74, 9, font, C.muted)
  if (!isTax) text("Leadkaun is not registered under GST.", M, 61, 8.5, font, C.muted)
  textRight(`${INVOICE_ISSUER.email} · ${INVOICE_ISSUER.website}`, RIGHT, 74, 9, font, C.muted)

  return await doc.save()
}
