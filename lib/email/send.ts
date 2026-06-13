import { Resend } from "resend"
import * as React from "react"

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "noreply@leadkaun.com"

interface SendEmailOptions {
  to: string | string[]
  subject: string
  react: React.ReactElement
  replyTo?: string
}

interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
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
    const { data, error } = await resend.emails.send({
      from:     FROM_ADDRESS,
      to:       opts.to,
      subject:  opts.subject,
      react:    opts.react,
      replyTo: opts.replyTo,
    })

    if (error) {
      console.error("Resend error:", error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("sendEmail failed:", message)
    return { success: false, error: message }
  }
}
