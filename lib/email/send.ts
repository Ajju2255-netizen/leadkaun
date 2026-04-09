import { Resend } from "resend"
import * as React from "react"

const resend = new Resend(process.env.RESEND_API_KEY)

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
  try {
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
