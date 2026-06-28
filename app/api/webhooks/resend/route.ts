import { prisma } from "@/lib/prisma"

/**
 * POST /api/webhooks/resend — Resend delivery webhook. Sets EmailLog.opened_at
 * on opens and flips status to failed on bounce/complaint, powering the
 * deliverability + brief-open metrics in Mission Control.
 *
 * Configure the webhook URL in Resend as
 *   https://app.leadkaun.com/api/webhooks/resend?secret=<RESEND_WEBHOOK_SECRET>
 * Signature (svix) verification can be layered on later; the simple shared-secret
 * query guard below blocks casual spoofing of open/bounce state.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    const provided = new URL(req.url).searchParams.get("secret")
    if (provided !== secret) return new Response("forbidden", { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const type = body?.type as string | undefined
  const emailId = body?.data?.email_id as string | undefined
  if (!type || !emailId) return new Response("ok")

  try {
    if (type === "email.opened") {
      await prisma.emailLog.updateMany({ where: { provider_id: emailId, opened_at: null }, data: { opened_at: new Date() } })
    } else if (type === "email.bounced" || type === "email.complained") {
      await prisma.emailLog.updateMany({ where: { provider_id: emailId }, data: { status: "failed", error: type } })
    }
  } catch (e) {
    console.error("[resend-webhook] update failed", e)
  }
  return new Response("ok")
}
