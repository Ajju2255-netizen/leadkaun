import { Resend } from "resend"
import { render } from "@react-email/components"
import * as React from "react"
import { prisma } from "@/lib/prisma"

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "noreply@leadkaun.com"

interface SendEmailOptions {
  to: string | string[]
  subject: string
  react: React.ReactElement
  replyTo?: string
  // Telemetry (Mission Control email log) — optional, best-effort.
  template?: string
  accountId?: string | null
}

interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

// Best-effort EmailLog write. Only called for real send attempts (key present).
async function logEmail(opts: SendEmailOptions, result: SendEmailResult): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        account_id:  opts.accountId ?? null,
        to_email:    Array.isArray(opts.to) ? opts.to[0] ?? "" : opts.to,
        template:    opts.template ?? "unknown",
        subject:     opts.subject,
        provider_id: result.id ?? null,
        status:      result.success ? "sent" : "failed",
        error:       result.error ?? null,
      },
    })
  } catch (e) {
    console.error("[email-log] failed to record", e)
  }
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  // Construct the client lazily, at send time — NOT at module load. The Resend
  // constructor throws when the API key is missing, and importing this module is
  // unavoidable during `next build` (route page-data collection). Eager
  // construction made the whole build fail whenever RESEND_API_KEY was absent
  // from the build env (e.g. Vercel Preview scope). Guarding here keeps the build
  // env-independent — a missing key just means emails no-op.
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("sendEmail skipped — RESEND_API_KEY not configured")
    return { success: false, error: "RESEND_API_KEY not configured" }
  }

  try {
    const resend = new Resend(apiKey)
    // Render the React email to HTML ourselves and send `html`. resend v6 no
    // longer bundles @react-email/render, so passing `react:` throws
    // "t is not a function" in the minified production bundle.
    const html = await render(opts.react)
    const { data, error } = await resend.emails.send({
      from:     FROM_ADDRESS,
      to:       opts.to,
      subject:  opts.subject,
      html,
      replyTo: opts.replyTo,
    })

    if (error) {
      console.error("Resend error:", error)
      const result = { success: false, error: error.message }
      await logEmail(opts, result)
      return result
    }

    const result = { success: true, id: data?.id }
    await logEmail(opts, result)
    return result
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("sendEmail failed:", message)
    const result = { success: false, error: message }
    await logEmail(opts, result)
    return result
  }
}
